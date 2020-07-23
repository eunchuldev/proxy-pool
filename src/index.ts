import Queue from 'denque';
const ProxyChain: any = require('proxy-chain');

async function timeout<T>(promise: Promise<T>, time: number): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | null = null;
  const res = await Promise.race([
    new Promise(
      (_, reject) =>
        (handle = setTimeout(() => reject(new Error('timeout')), time))
    ) as Promise<T>,
    promise,
  ]);
  if (handle) clearTimeout(handle);
  return res;
}

export interface IDeploymentConstructor {
  new (): IDeployment;
}
export interface IDeployment {
  deploy(): Promise<void>;
  address(): string | null;
  healthCheck(): Promise<boolean>;
  destroy(): Promise<void>;
}

class DeploymentWithPromises {
  deployment: IDeployment;
  deployPromise?: Promise<void>;
  constructor(deploymentConstructor: IDeploymentConstructor) {
    this.deployment = new deploymentConstructor();
    this.deployPromise = this.deployment.deploy();
  }
  async destroy() {
    await this.deployPromise;
    await this.deployment.destroy();
  }
  async address(): Promise<string | null> {
    await this.deployPromise;
    return this.deployment.address();
  }
}

class Worker {
  maxAge: number;
  deploymentConstructor: IDeploymentConstructor;
  deployments: Queue<DeploymentWithPromises> = new Queue();
  rotating = false;
  destroyed = false;
  rotateTick: ReturnType<typeof setTimeout>;
  constructor(deploymentConstructor: IDeploymentConstructor, maxAge: number) {
    this.maxAge = maxAge;
    this.deploymentConstructor = deploymentConstructor;
    const firstDep = new DeploymentWithPromises(deploymentConstructor);
    this.deployments = new Queue([firstDep]);
    this.destroyed = false;
    this.rotateTick = setInterval(() => this.rotate(), maxAge);
  }
  async _rotate() {
    const fresh = new DeploymentWithPromises(this.deploymentConstructor);
    this.deployments.push(fresh);
    await fresh.deployPromise;
    const stale = this.deployments.shift();
    await stale?.deployment.destroy();
  }
  async rotate() {
    try {
      await timeout(this._rotate(), this.maxAge);
    } catch (e) {
      console.log(new Date(), e);
      while (this.deployments.length > 2)
        await this.deployments.shift()?.destroy();
    }
    if (this.destroyed)
      while (this.deployments.length) await this.deployments.shift()?.destroy();
  }
  async address(): Promise<string | null> {
    return this.deployments.peekFront()?.address() || null;
  }
  async destroy() {
    this.destroyed = true;
    clearInterval(this.rotateTick);
    await Promise.all(this.deployments.toArray().map(d => d.destroy()));
  }
}

export interface IMasterProxyServerOption {
  port: number;
  maxWorkerAge: number;
  maxWorkerCount: number;
}
export class MasterProxyServerOption implements MasterProxyServerOption {
  port: number;
  maxWorkerAge: number;
  maxWorkerCount: number;
  constructor(port = 80, maxWorkerAge = 10 * 60 * 1000, maxWorkerCount = 5) {
    this.port = port;
    this.maxWorkerAge = maxWorkerAge;
    this.maxWorkerCount = maxWorkerCount;
  }
}

export default class MasterProxyServer {
  option: IMasterProxyServerOption;
  workers: Worker[] = [];
  requestCountsByHost: {[host: string]: number} = {};
  server: any;
  constructor(
    deploymentConstructor: IDeploymentConstructor,
    option: Partial<IMasterProxyServerOption> = new MasterProxyServerOption()
  ) {
    this.option = Object.assign(new MasterProxyServerOption(), option);
    this.server = new ProxyChain.Server({
      port: this.option.port,
      verbose: false,
      prepareRequestFunction: async ({ request, username, password, hostname, port, isHttp, connectionId, }: any) => {
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
  async nextProxyUrl(host: string): Promise<string | null> {
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
