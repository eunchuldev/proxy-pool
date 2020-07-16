const { DefaultDict, AsyncPriorityQueue, sleep } = require("./util");
const Queue = require("denque");
const ProxyChain = require("proxy-chain");

const PORT = 8080;


class HostStat {
  constructor() {
    this.requestedAt = new Date(0);
  }
}
class Worker {
  constructor(deploymentConstructor, id) {
    this.hostStats = new DefaultDict(HostStat);
    this.deployment = new deploymentConstructor();
    this.firstRequestedAt = null;
    this._isReady = false;
    this.destroyPromise = null;
    this.destroyMarked = false;
    this.id = id;
    this.deployPromise = null;
  }
  elapsed(host) {
    return new Date() - this.hostStats[host].requestedAt;
  }
  liveTime() {
    return this.firstRequestedAt? new Date() - this.firstRequestedAt: 0;
  }
  priority(host) {
    return this.hostStats[host].requestedAt.getTime();
  }
  deploy() {
    this.deployPromise = this.deployment.deploy();
    this._isReady = true
  }
  markDestroy(){
    this.destroyMarked = true;
  }
  async destroy(){
    if(this.destroyPromise)
      return await this.destroyPromise;
    this.destroyingPromise = this.deployment.destroy();
    this._isReady = false;
    return await this.destroyingPromise;
  }
  isDead(){
    return this.destroyingPromise || this.destroyMarked || !this.deployment.isAlive();
  }
  address(){
    if(!this._isReady)
      throw new Error("worker is not ready");
    if(this.isDead())
      throw new Error("worker is die");
    return this.deployment.address();
  }
  isReady() {
    return this._isReady
  }
  request(host){
    if(!this._isReady)
      throw new Error("worker is not ready");
    this.firstRequestedAt = this.firstRequestedAt || new Date();
    this.hostStats[host].requestedAt = new Date();
    return this.hostStats[host];
  }
}

class SimpleWorkerPool {
  constructor(size, deploymentConstructor) {
    this.pool = new Queue();
    this.size = size;
    this.nextWorkerId = 0;
    this.deploymentConstructor = deploymentConstructor;
    for(let i=0; i<size; ++i)
      this.spawn();
  }
  spawn(){
    let worker = new Worker(this.deploymentConstructor, this.nextWorkerId++);
    worker.deploy();
    this.pool.push(worker);
  }
  tryPull(){
    if(this.pool.peekFront().isReady()){
      this.spawn();
      let worker = this.pool.shift();
      return worker;
    }
    else return null;
  }
  async pull(){
    this.spawn();
    let worker = this.pool.shift();
    await worker.deployPromise;
    return worker;
  }
}

class MasterProxyServerOption {
  constructor(port = 80, maxWorkerLiveTime = 600, desireRequestThroughputPerHost = 1000, spareWorkerPoolSize = 2, maxWorkerCount = 10) {
    this.port = port;
    this.maxWorkerLiveTime = maxWorkerLiveTime;
    this.desireRequestThroughputPerHost = desireRequestThroughputPerHost;
    this.spareWorkerPoolSize = spareWorkerPoolSize;
    this.maxWorkerCount = maxWorkerCount
  }
}
class MasterProxyServer {
  constructor(deploymentConstructor, option) {
    this.option = Object.assign(new MasterProxyServerOption(), option || {})
    this.workers = {};
    this.workerPool = new SimpleWorkerPool(this.option.spareWorkerPoolSize, deploymentConstructor);
    this.workerCount = 0;
    this.workerQueueByHost = {};
    this.server = new ProxyChain.Server({
      port: this.option.port,
      //verbose: true,
      prepareRequestFunction: async ({ request, username, password, hostname, port, isHttp, connectionId }) => {
        try{
          console.log(connectionId);
          const proxyUrl = await this.nextProxyUrl(request.headers.host);
          return { upstreamProxyUrl: proxyUrl, };
        } catch(e){
          console.log(e);
          throw e;
        }
      },
    });
    this.server.on('connectionClosed', ({ connectionId, stats }) => {
      console.log(`Connection ${connectionId} closed`);
    });
  }
  async nextProxyUrl(host){
    let queue = this.workerQueueByHost[host];
    if(queue == null) queue = this.workerQueueByHost[host] = new AsyncPriorityQueue(Object.values(this.workers), (a, b) => a.priority(host) - b.priority(host));
    if(queue.peek() == undefined)
      this.tryDeployNewWorker();
    let worker = await queue.pop();
    while(worker.liveTime() > this.option.maxWorkerLiveTime*1000){
      this.dropWorker(worker);
      worker = await queue.pop();
    }
    while(worker.isDead()){
      console.log("dead", worker.id);
      this.dropWorker(worker);
      if(queue.peek() == undefined)
        this.tryDeployNewWorker();
      worker = await queue.pop();
    }
    console.log("elapsed", worker.id, worker.elapsed(host));
    if(worker.elapsed(host) < 1000/this.option.desireRequestThroughputPerHost){
      this.tryDeployNewWorker();
      await sleep(1000/this.option.desireRequestThroughputPerHost - worker.elapsed(host))
    }
    worker.request(host);
    queue.push(worker);
    return worker.address();
  }
  dropWorker(worker){
    if(this.workers[worker.id]){
      delete this.workers[worker.id];
      this.workerCount -= 1;
      if(this.workerCount === 0)
        this.tryDeployNewWorker();
    }
    worker.markDestroy();
    worker.destroy();
  }
  async tryDeployNewWorker(){
    if(this.deploying || this.workerCount >= this.option.maxWorkerCount)
      return null;
    this.workerCount += 1;
    this.deploying = true;
    let worker = await this.workerPool.pull()
    this.workers[worker.id] = worker
    for(let k in this.workerQueueByHost){
      this.workerQueueByHost[k].push(worker);
    }
    this.deploying = false;
  }
  async listen() {
    //await this.tryDeployNewWorker();
    await this.server.listen();
  }
}

module.exports = MasterProxyServer;