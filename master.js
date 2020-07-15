const { DefaultDict } = require("./util");
const PriorityQueue = require("tinyqueue");
const ProxyChain = require("proxy-chain");

const PORT = 8080;

const MAX_SLAVE_COUNT = 8;


class HostStat {
  constructor() {
    this.requestedAt = new Date(0);
  }
}
class Slave {
  constructor(deploymentConstructor, id) {
    this.hostStats = new DefaultDict(HostStat);
    this.deployment = new deploymentConstructor();
    this.firstRequestedAt = null;
    this.isReady = false;
    this.destroyed = false;
    this.id = id;
  }
  priority(host) {
    return this.hostStats[host].requestedAt.getTime();
  }
  async deploy() {
    await this.deployment.deploy();
    this.firstRequestedAt = new Date();
    this.isReady = true
  }
  async destroy(){
    this.destroyed = true;
    this.isReady = false;
    await this.deployment.destroy();
  }
  isDead(){
    return this.destroyed || !this.deployment.isAlive();
  }
  address(){
    if(!this.isReady)
      throw new Error("slave is not ready");
    if(this.isDead())
      throw new Error("slave is die");
    return this.deployment.address();
  }
  request(host){
    if(!this.isReady)
      throw new Error("slave is not ready");
    this.hostStats[host].requestedAt = new Date();
    return this.hostStats[host];
  }
}

class MasterProxyServerOption {
  constructor(port, maxSlaveLiveTime = 600, desireSlaveRequestThroughputPerHost = 1000) {
    this.port = port;
    this.maxSlaveLiveTime = maxSlaveLiveTime;
    this.desireSlaveRequestThroughputPerHost = desireSlaveRequestThroughputPerHost;
  }
}
class MasterProxyServer {
  constructor(deploymentConstructor, option = new MasterProxyServerOption()) {
    this.deploymentConstructor = deploymentConstructor;
    this.option = option;
    this.spareSlaves = [];
    this.slaves = {};
    this.slaveQueueByHost = {};
    this._nextSlaveId = 0;
    this.server = new ProxyChain.Server({
      port: option.port || 80, 
      //verbose: true,
      prepareRequestFunction: async ({ request, username, password, hostname, port, isHttp, connectionId }) => {
        const proxyUrl = await this.nextProxyUrl(request.headers.host);
        if(proxyUrl == null)
          throw new ProxyChain.RequestError('Proxy Pool is Empty. Try again', 500);
        return {
          upstreamProxyUrl: proxyUrl,
          //requestAuthentication: false,
          //failMsg: 'Bad username or password, please try again.',
        };
      },
    });
  }
  async nextProxyUrl(host) {
    let queue = this.slaveQueueByHost[host];
    if(queue == null){
      queue = this.slaveQueueByHost[host] = new PriorityQueue(Object.values(this.slaves), (a, b) => a.priority(host) - b.priority(host));
      console.log(queue);
    }
    let slave = queue.pop();
    while(slave != undefined && slave.isDead()){
      console.log("slave is dead. skip it");
      delete this.slaves[slave.id];
      slave = queue.pop();
    }
    if(slave == undefined){
      console.log("no slave available. deploy new one");
      await this.deploySlave();
      return null;
    }
    let elapsed = new Date() - slave.hostStats[host].requestedAt;
    if(elapsed < 1/this.option.desireSlaveRequestThroughputPerHost)
      this.deploySlave();
    slave.request(host);
    queue.push(slave);
    return slave.address();
  }
  async slaveExpiringCheck(slave, host) {
  }
  async deploySlave(){
    if(this._deploying)
      return null;
    this._deploying = true;
    let slave = new Slave(this.deploymentConstructor, this._nextSlaveId++);
    await slave.deploy();
    this.slaves[slave.id] = slave
    for(let k in this.slaveQueueByHost){
      this.slaveQueueByHost[k].push(slave);
    }
    this._deploying = false;
    return slave;
  }
  async destroySlave(){
  }
  async listen() {
    await this.deploySlave();
    await this.server.listen();
  }
}

module.exports = MasterProxyServer;
