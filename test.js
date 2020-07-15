const ProxyChain = require('proxy-chain');
const MasterProxyServer = require('./master');
axios = require("axios");

let nextPort = 10000;
describe("unit test", () => {
  const Deployment = require('./deployment-interface');
  class testDeployment extends Deployment {
    async deploy() {
      this.port = ++nextPort;
      this._address = `http://127.0.0.1:${this.port}`, 
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
    async detroy() {
      await this.server.close();
    }
  }
  it("hihi", async () => {
    let port = 8080;
    let server = new MasterProxyServer(testDeployment, {port});
    await server.listen();
    let res = await axios.get("http://tsu.gg", {
      proxy: {
        host: '127.0.0.1',
        port,
      }
    });
    expect(res.data).toEqual(expect.stringMatching(/http:\/\/127.0.0.1:10[0-9]{3}/));
  });
});

