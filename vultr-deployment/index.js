const VultrNode = require('@vultr/vultr-node')
const { Deployment } = require("proxy-pool");
const util = require('util')
const keygen = util.promisify(require('ssh-keygen'));

const VULTR_DEPLOYMENT_SSHKEY_NAME = "proxy-pool-deployment-ssh-key";
const VULTR_TEMPLATE_VPS_TAG = "proxy-pool-deployment-template-vps";

const OSID = "167" // centos 7 x64
const VPSPLANID = "201" // $5 starter
const REGIONID = "34" // SEOUL

const vultr = VultrNode.initialize({
  apiKey: "DNBT4GNZGW4WPQPY4NARSFLCY6PFIL4E5CDQ",
});

async function genSshKey(){
  let sshkey = Object.values(await this.vultr.sshkey.list()).find(key => key.name == VULTR_DEPLOYMENT_SSHKEY_NAME);
  if(sshkey)
    return sshkey;
  if(!sshkey){
    let {key, pubKey} = await keygen({location: __dirname + '/sshkey'});
    sshkey = await vultr.sshkey.create({name: VULTR_DEPLOYMENT_SSHKEY_NAME, ssh_key: pubKey});
  }
  return sshkey;
}
async function genSnapshot () {
  let sshkey = await genSshKey();
  let vps = await vultr.server.list({tag: VULTR_TEMPLATE_VPS_TAG});
  if(vps.length)
    console.log("exist", vps);
  else
    vps = await vultr.server.create({
      OSID, VPSPLANID, DCID: REGIONID, SSHKEYID: sshkey.id,
    });
  console.log(vps);
}

class VultrDeployment extends Deployment {
  async deploy() {
    let sshkey = await loadSshkey();
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

async function init(){
    let sshkeys = await vultr.sshkey.list();
}
(async () =>{
  await genSnapshot();
})();

