const ProxyChain: any = require('proxy-chain');
import MasterProxyServer, {IDeployment} from '../src/index';
import * as tunnel from 'tunnel';
import axios from 'axios';

const sleep = (time: number) =>
  new Promise(resolve => setTimeout(resolve, time));

describe('unit test', () => {
  let nextPort = 10000;
  beforeEach(() => {
    nextPort = 10000;
  });
  class testDeployment implements IDeployment {
    _address: string | null = null;
    port: number | null = nextPort++;
    server: any;
    async deploy() {
      await sleep(1000);
      this._address = `http://127.0.0.1:${this.port}`;
      this.server = new ProxyChain.Server({
        port: this.port,
        prepareRequestFunction: ({ request, username, password, hostname, port, isHttp, }: any) => {
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
    async healthCheck() {
      return true;
    }
    async destroy() {
      //await new Promise(resolve => setTimeout(resolve, 1000));
      await this.server.close();
    }
  }
  it('one time proxy', async () => {
    const port = 8080;
    const server = new MasterProxyServer(testDeployment, {port});
    await server.listen();
    const res = await axios.get('http://tsu.gg', {
      proxy: {
        host: '127.0.0.1',
        port,
      },
    });
    expect(res.data).toEqual(expect.stringMatching(/http:\/\/127.0.0.1:10000/));
    await server.close();
    //expect(res.data).toEqual(expect.stringMatching(/http:\/\/127.0.0.1:10[0-9]{3}/));
  });
  it('very frequent proxy', async () => {
    const port = 8082;
    nextPort = 10020;
    const server = new MasterProxyServer(testDeployment, {port});
    await server.listen();
    const res = await Promise.all(
      [...Array(5).keys()].map(_ =>
        axios
          .get('http://tsu.gg', {proxy: {host: '127.0.0.1', port}})
          .then(res => res.data)
      )
    );
    expect(res).toEqual([
      'http://127.0.0.1:10020',
      'http://127.0.0.1:10021',
      'http://127.0.0.1:10022',
      'http://127.0.0.1:10023',
      'http://127.0.0.1:10024',
    ]);
    await server.close();
  });
  it('multiple host proxy', async () => {
    const port = 8083;
    nextPort = 10020;
    const server = new MasterProxyServer(testDeployment, {port});
    await server.listen();
    const res = await Promise.all(
      [...Array(2).keys()].map(i =>
        axios
          .get(i % 2 ? 'http://tsu.gg' : 'http://google.com', {
            proxy: {host: '127.0.0.1', port},
          })
          .then(res => res.data)
      )
    );
    expect([...new Set(res)].length).toEqual(1);
    await server.close();
  });
  it('proxy rotation', async () => {
    const port = 8085;
    nextPort = 10040;
    const server = new MasterProxyServer(testDeployment, {
      port,
      maxWorkerAge: 3000,
      maxWorkerCount: 5,
    });
    await server.listen();
    let res = await Promise.all(
      [...Array(5).keys()].map(i =>
        axios
          .get('http://tsu.gg', {proxy: {host: '127.0.0.1', port}})
          .then(res => res.data)
      )
    );
    expect(res).toEqual([
      'http://127.0.0.1:10040',
      'http://127.0.0.1:10041',
      'http://127.0.0.1:10042',
      'http://127.0.0.1:10043',
      'http://127.0.0.1:10044',
    ]);
    await sleep(3000);
    res = await Promise.all(
      [...Array(5).keys()].map(i =>
        axios
          .get('http://tsu.gg', {proxy: {host: '127.0.0.1', port}})
          .then(res => res.data)
      )
    );
    expect(res).toEqual([
      'http://127.0.0.1:10045',
      'http://127.0.0.1:10046',
      'http://127.0.0.1:10047',
      'http://127.0.0.1:10048',
      'http://127.0.0.1:10049',
    ]);
    await server.close();
  });
  it('tunneling https', async () => {
    class Deployment implements IDeployment {
      _address: string | null = null;
      port: number | null = nextPort++;
      server: any;
      async deploy() {
        this._address = `http://127.0.0.1:${this.port}`;
        this.server = new ProxyChain.Server({
          port: this.port,
        });
        await this.server.listen();
      }
      address() {
        return this._address;
      }
      async healthCheck() {
        return true;
      }
      async destroy() {
        //await new Promise(resolve => setTimeout(resolve, 1000));
        await this.server.close();
      }
    }
    const port = 8085;
    const server = new MasterProxyServer(Deployment, {
      port,
      maxWorkerAge: 3000,
      maxWorkerCount: 5,
    });
    await server.listen();
    const tunnelingAgent = tunnel.httpOverHttp({
      proxy: {
        host: '127.0.0.1',
        port: port,
      },
    });
    const res = await axios.get('https://google.com', {
      httpsAgent: tunnelingAgent,
    });
    await server.close();
  });
});
