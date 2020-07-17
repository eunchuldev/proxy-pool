const axios = require("axios");
const tunnel = require("tunnel");
async function req(){
  var tunnelingAgent = tunnel.httpsOverHttp({
    proxy: {
      host: '127.0.0.1',
      port: 8080
    }
  });
  let res = await Promise.all([...Array(100).keys()].map(i => axios.get("https://api.myip.com", {proxy: false, httpAgent: tunnelingAgent, httpsAgent: tunnelingAgent}).then(res => res.data)));
  console.log(res);
}
req();
