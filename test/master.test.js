const { sleep, } = require('../util');
const ProxyChain = require('proxy-chain');
const MasterProxyServer = require('../master');
const tunnel = require("tunnel");
axios = require("axios");

describe("unit test", () => {
  let nextPort = 10000;
  beforeEach(() => {
    //nextPort = 10000;
  });
  const Deployment = require('../deployment-interface');
  class testDeployment extends Deployment {
    async deploy() {
      this.port = nextPort++;
      await sleep(1000);
      this._address = `http://127.0.0.1:${this.port}`;
      this.server = new ProxyChain.Server({
        port: this.port,
        prepareRequestFunction: ({ request, username, password, hostname, port, isHttp }) => {
          return {
            customResponseFunction: () => {
              return {
                statusCode: 200,
                body: `${this._address}`,
              };
            },
          };
        },
      });
      await this.server.listen();
    }
    address() {
      return this._address;
    }
    isAlive() {
      return true;
    }
    async destroy() {
      await sleep(1000);
      await this.server.close();
    }
  }
  it("one time proxy", async () => {
    let port = 8080;
    nextPort = 10000;
    let server = new MasterProxyServer(testDeployment, {port});
    await server.listen();
    let res = await axios.get("http://tsu.gg", {
      proxy: {
        host: '127.0.0.1',
        port,
      }
    });
    expect(res.data).toEqual(expect.stringMatching(/http:\/\/127.0.0.1:10000/));
    //expect(res.data).toEqual(expect.stringMatching(/http:\/\/127.0.0.1:10[0-9]{3}/));
  });
  it("frequent proxy", async () => {
    let port = 8081;
    nextPort = 10003;
    let server = new MasterProxyServer(testDeployment, {port, desireRequestThroughputPerHost: 1});
    await server.listen();

    let res = await axios.get("http://tsu.gg", {
      proxy: {
        host: '127.0.0.1',
        port,
      }
    });
    expect(res.data).toEqual(expect.stringMatching(/http:\/\/127.0.0.1:10003/));
    await sleep(500)
    res = await axios.get("http://tsu.gg", {
      proxy: {
        host: '127.0.0.1',
        port,
      }
    });
    expect(res.data).toEqual(expect.stringMatching(/http:\/\/127.0.0.1:10003/));
    await sleep(500)
    res = await axios.get("http://tsu.gg", {
      proxy: {
        host: '127.0.0.1',
        port,
      }
    });
    expect(res.data).toEqual(expect.stringMatching(/http:\/\/127.0.0.1:10004/));
    await sleep(500)
    res = await axios.get("http://tsu.gg", {
      proxy: {
        host: '127.0.0.1',
        port,
      }
    });
    expect(res.data).toEqual(expect.stringMatching(/http:\/\/127.0.0.1:10003/));
    expect(Object.keys(server.workers).length).toEqual(2);
    //expect(res.data).toEqual(expect.stringMatching(/http:\/\/127.0.0.1:10[0-9]{3}/));
  });
  it("very frequent proxy", async () => {
    let port = 8082;
    nextPort = 10010;
    let server = new MasterProxyServer(testDeployment, {port, desireRequestThroughputPerHost: 1});
    await server.listen();
    let t = new Date();
    let res = await Promise.all([...Array(10).keys()].map(_ => axios.get("http://tsu.gg", { proxy: { host: '127.0.0.1', port, } }).then(res => res.data)));
    for(let r of res)
      expect(r).toEqual(expect.stringMatching(/http:\/\/127.0.0.1:100[0-9]{2}/));
    expect(res).toEqual(expect.arrayContaining(["http://127.0.0.1:10010", "http://127.0.0.1:10011", "http://127.0.0.1:10012"]));
    let elapsed = new Date() - t;
    expect(elapsed).toBeLessThan(5000);
  });
  it("very frequent multiple host proxy", async () => {
    let port = 8083;
    nextPort = 10020;
    let server = new MasterProxyServer(testDeployment, {port, desireRequestThroughputPerHost: 1});
    await server.listen();
    let t = new Date();
    let res = await Promise.all([...Array(20).keys()].map(i => axios.get(i%2? "http://tsu.gg": "http://google.com", { proxy: { host: '127.0.0.1', port, } }).then(res => res.data)));
    for(let r of res)
      expect(r).toEqual(expect.stringMatching(/http:\/\/127.0.0.1:100[0-9]{2}/));
    expect(res).toEqual(expect.arrayContaining(["http://127.0.0.1:10020", "http://127.0.0.1:10021", "http://127.0.0.1:10022"]));
    let elapsed = new Date() - t;
    expect(elapsed).toBeLessThan(5000);
  });
  it("very frequent multiple host proxy limit capacity", async () => {
    let port = 8084;
    nextPort = 10030;
    let server = new MasterProxyServer(testDeployment, {port, desireRequestThroughputPerHost: 1, maxWorkerCount: 2});
    await server.listen();
    let t = new Date();
    let res = await Promise.all([...Array(16).keys()].map(i => axios.get(i%2? "http://tsu.gg": "http://google.com", { proxy: { host: '127.0.0.1', port, } }).then(res => res.data)));
    for(let r of res)
      expect(r).toEqual(expect.stringMatching(/http:\/\/127.0.0.1:100[0-9]{2}/));
    expect([...new Set(res)].sort()).toEqual(["http://127.0.0.1:10030", "http://127.0.0.1:10031"]);
    let elapsed = new Date() - t;
    expect(elapsed).toBeLessThan(5000);
  })
  it("proxy lifetime expired", async () => {
    let port = 8085;
    nextPort = 10040;
    let server = new MasterProxyServer(testDeployment, {port, desireRequestThroughputPerHost: 100, maxWorkerLiveTime: 1, maxWorkerCount: 2});
    await server.listen();
    var tunnelingAgent = tunnel.httpOverHttp({
      proxy: {
        host: '127.0.0.1',
        port: 8080
      }
    });
    let t = new Date();
    let res = await Promise.all([...Array(10).keys()].map(i => axios.get("http://tsu.gg", { proxy: { host: '127.0.0.1', port, } }).then(res => res.data)));
    for(let r of res)
      expect(r).toEqual(expect.stringMatching(/http:\/\/127.0.0.1:100[0-9]{2}/));
    console.log(res);
    expect([...new Set(res)].sort()).toEqual(["http://127.0.0.1:10040", "http://127.0.0.1:10041"]);
    await sleep(2000);
    res = await Promise.all([...Array(10).keys()].map(i => axios.get("http://tsu.gg", { proxy: { host: '127.0.0.1', port, } }).then(res => res.data)));
    console.log(res);
    expect([...new Set(res)].sort()).toEqual(["http://127.0.0.1:10042", "http://127.0.0.1:10043"]);
    let elapsed = new Date() - t;
    expect(elapsed).toBeLessThan(5000);
  })
});

