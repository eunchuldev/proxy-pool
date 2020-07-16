const VultrDeployment = require("./index.js")
const { MasterProxyServer } = require("proxy-pool");

let server = new MasterProxyServer(VultrDeployment, {
  port: 8080, 
  desireRequestThroughputPerHost: 100, 
  maxWorkerLiveTime: 3600, 
  maxWorkerCount: 5, 
  spareWorkerPoolSize: 1});
server.listen();
