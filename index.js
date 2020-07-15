const MasterProxyServer = require('./master');
const Deployment = require('./deployment-interface');
class testDeployment extends Deployment {
    async deploy() {
      this.port = ++nextPort;
      this.address = `http://127.0.0.1:${this.port}`, 
      this.server = new ProxyChain.Server({
        port: this.port,
        prepareRequestFunction: ({ request, username, password, hostname, port, isHttp }) => {
          return {
            customResponseFunction: () => {
              return {
                statusCode: 200,
                body: `${this.address}`,
              };
            },
          };
        },
      });
      await this.server.listen();
    }
    address() {
      return this.address;
    }
    isAlive() {
      return true;
    }
    async detroy() {
      await this.server.close();
    }
  }
let server = new MasterProxyServer(testDeployment, {port:8080});
server.listen();
