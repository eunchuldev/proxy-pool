const ProxyChain = require('proxy-chain');
const axios = require("axios");
const server = new ProxyChain.Server({
  port: 8080,
  verbose: true,
  /*prepareRequestFunction: ({ request, username, password, hostname, port, isHttp }) => {
  },*/
})
it("proxy https", async () => {
  await server.listen();
  var tunnelingAgent = tunnel.httpsOverHttp({
    proxy: {
      host: '127.0.0.1',
      port: 8080
    }
  });
  let res = await axios.get("https://google.com", { });
  console.log(res);
});
