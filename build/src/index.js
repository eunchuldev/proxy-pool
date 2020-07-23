'use strict';
const __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : {default: mod};
  };
Object.defineProperty(exports, '__esModule', {value: true});
exports.MasterProxyServerOption = void 0;
const denque_1 = __importDefault(require('denque'));
const ProxyChain = require('proxy-chain');
async function timeout(promise, time) {
  let handle = null;
  const res = await Promise.race([
    new Promise(
      (_, reject) =>
        (handle = setTimeout(() => reject(new Error('timeout')), time))
    ),
    promise,
  ]);
  if (handle) clearTimeout(handle);
  return res;
}
class DeploymentWithPromises {
  constructor(deploymentConstructor) {
    this.deployment = new deploymentConstructor();
    this.deployPromise = this.deployment.deploy();
  }
  async destroy() {
    await this.deployPromise;
    await this.deployment.destroy();
  }
  async address() {
    await this.deployPromise;
    return this.deployment.address();
  }
}
class Worker {
  constructor(deploymentConstructor, maxAge) {
    this.deployments = new denque_1.default();
    this.rotating = false;
    this.destroyed = false;
    this.maxAge = maxAge;
    this.deploymentConstructor = deploymentConstructor;
    const firstDep = new DeploymentWithPromises(deploymentConstructor);
    this.deployments = new denque_1.default([firstDep]);
    this.destroyed = false;
    this.rotateTick = setInterval(() => this.rotate(), maxAge);
  }
  async _rotate() {
    const fresh = new DeploymentWithPromises(this.deploymentConstructor);
    this.deployments.push(fresh);
    await fresh.deployPromise;
    const stale = this.deployments.shift();
    await (stale === null || stale === void 0
      ? void 0
      : stale.deployment.destroy());
  }
  async rotate() {
    let _a, _b;
    try {
      await timeout(this._rotate(), this.maxAge);
    } catch (e) {
      console.log(new Date(), e);
      while (this.deployments.length > 2)
        await ((_a = this.deployments.shift()) === null || _a === void 0
          ? void 0
          : _a.destroy());
    }
    if (this.destroyed)
      while (this.deployments.length)
        await ((_b = this.deployments.shift()) === null || _b === void 0
          ? void 0
          : _b.destroy());
  }
  async address() {
    let _a;
    return (
      ((_a = this.deployments.peekFront()) === null || _a === void 0
        ? void 0
        : _a.address()) || null
    );
  }
  async destroy() {
    this.destroyed = true;
    clearInterval(this.rotateTick);
    await Promise.all(this.deployments.toArray().map(d => d.destroy()));
  }
}
class MasterProxyServerOption {
  constructor(port = 80, maxWorkerAge = 10 * 60 * 1000, maxWorkerCount = 5) {
    this.port = port;
    this.maxWorkerAge = maxWorkerAge;
    this.maxWorkerCount = maxWorkerCount;
  }
}
exports.MasterProxyServerOption = MasterProxyServerOption;
class MasterProxyServer {
  constructor(deploymentConstructor, option = new MasterProxyServerOption()) {
    this.workers = [];
    this.requestCountsByHost = {};
    this.option = Object.assign(new MasterProxyServerOption(), option);
    this.server = new ProxyChain.Server({
      port: this.option.port,
      verbose: false,
      prepareRequestFunction: async ({
        request,
        username,
        password,
        hostname,
        port,
        isHttp,
        connectionId,
      }) => {
        try {
          const proxyUrl = await this.nextProxyUrl(request.headers.host);
          if (proxyUrl) return {upstreamProxyUrl: proxyUrl};
          else return;
        } catch (e) {
          console.log(e);
          throw e;
        }
      },
    });
    this.workers = [...Array(this.option.maxWorkerCount).keys()].map(
      _ => new Worker(deploymentConstructor, this.option.maxWorkerAge)
    );
    process.on('SIGTERM', () => {
      console.info('SIGTERM signal received.');
      console.log('Closing server gracefully...');
      this.close().then(() => {
        process.exit(0);
      });
    });
    process.on('SIGINT', () => {
      console.info('SIGINT signal received.');
      console.log('Closing server gracefully...');
      this.close().then(() => {
        process.exit(0);
      });
    });
  }
  async nextProxyUrl(host) {
    if (this.requestCountsByHost[host] == null)
      this.requestCountsByHost[host] = 0;
    return await this.workers[
      this.requestCountsByHost[host]++ % this.workers.length
    ].address();
  }
  async listen() {
    await this.server.listen();
  }
  async close() {
    await this.server.close(true);
    await Promise.all(this.workers.map(w => w.destroy()));
  }
}
exports.default = MasterProxyServer;
//# sourceMappingURL=index.js.map
