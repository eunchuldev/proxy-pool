const VultrNode = require('@vultr/vultr-node')
const vultr = VultrNode.initialize({
  apiKey: process.env.VULTR_API_KEY,
});
const { Deployment } = require("proxy-pool");
const util = require('util')
const keygen = util.promisify(require('ssh-keygen'));
const path = require("path");
const fs = require("fs");
const Ssh = require('node-ssh');

const VULTR_DEPLOYMENT_SSHKEY_NAME = "proxy-pool-deployment-ssh-key";
const VULTR_TEMPLATE_VPS_LABEL = "proxy-pool-deployment-template-vps";
const VULTR_TEMPLATE_SNAPSHOT_DESCRIPTION = "proxy-pool-deployment-template-snapshot";
const VULTR_PROXY_WORKER_VPS_LABEL = "proxy-pool-worker";
const VULTR_TEMPLATE_SNAPSHOT_ID_PATH = __dirname + "/template-snapshot-id.txt";
const SSH_KEY_PATH = __dirname + "/sshkey";

const OSID = 167 // centos 7 x64
const VPSPLANID = 201 // $5 starter
const REGIONID = 34 // SEOUL

const SNAPSHOT_OSID=164


async function waitVpsServerReady(id){
  let vps = (await vultr.server.list({SUBID: parseInt(id)}));
  while(vps.server_state === 'locked' || vps.status === 'pending' || vps.power_status === 'stopped'){
    await new Promise(r => setTimeout(r, 1000));
    vps = (await vultr.server.list({SUBID: parseInt(id)}));
  }
  return vps;
}

async function waitSnapshotReady(id){
  let snapshot = (await vultr.snapshot.list({SNAPSHOTID: id}))[id];
  while(snapshot.status === 'pending'){
    await new Promise(r => setTimeout(r, 1000));
    snapshot = (await vultr.snapshot.list({SNAPSHOTID: id}))[id];
  }
  return snapshot;
}

async function genSshKey(){
  let sshkey = Object.values(await vultr.sshkey.list()).find(key => key.name == VULTR_DEPLOYMENT_SSHKEY_NAME);
  if(sshkey){
    console.log("destroy existing ssh key...")
    await vultr.sshkey.delete(sshkey);
  }
  console.log(new Date(), "gen ssh key..");
  let {key, pubKey} = await keygen({location: SSH_KEY_PATH});
  sshkey = await vultr.sshkey.create({name: VULTR_DEPLOYMENT_SSHKEY_NAME, ssh_key: pubKey});
  return {
    id: sshkey.SSHKEYID, 
    privateKey: key,
  };
}
async function genSnapshot () {
  let sshkey = await genSshKey();
  let vpses = Object.values(await vultr.server.list({label: VULTR_TEMPLATE_VPS_LABEL}));
  if(vpses.length){
    console.log(new Date(), "destroy existing template vps...")
    for(let v of vpses){
      if(v.server_state === 'locked')
        await waitVpsServerReady(v.SUBID);
      vultr.server.delete({SUBID: parseInt(v.SUBID)});
    }
  }
  console.log(new Date(), "create template vps..")
  let vps = await vultr.server.create({
    OSID, VPSPLANID, DCID: REGIONID, SSHKEYID: sshkey.id, label: VULTR_TEMPLATE_VPS_LABEL
  });
  vps = await waitVpsServerReady(vps.SUBID);
  console.log(new Date(), "ip of template vps: ", vps.main_ip);
  while(!ssh.isConnected()){
    try{
      await ssh.connect({
        host: vps.main_ip,
        username: 'root',
        privateKey: sshkey.privateKey
      })
    } catch(e) {
      console.log(e);
      await new Promise(r => setTimeout(r, 1000));
    }
  } 
  console.log(new Date(), "startup template...");
  await ssh.putDirectory('data', '/var/app', { validate: (itemPath) => path.basename(itemPath) !== 'node_modules' });
  let res = await ssh.execCommand('sh startup_script.sh', {cwd: '/var/app'});
  console.log(res.stdout);
  console.log(res.stderr);
  ssh.dispose();

  let snapshots = Object.values(await vultr.snapshot.list());
  if(snapshots.length){
    console.log(new Date(), "destroy existing template snapshot...")
    for(let s of snapshots)
      if(s.description === VULTR_TEMPLATE_SNAPSHOT_DESCRIPTION)
        await vultr.snapshot.delete(s);
  }
  console.log(new Date(), "create template snapshot...")
  let snapshot = await vultr.snapshot.create({
    SUBID: parseInt(vps.SUBID), description: VULTR_TEMPLATE_SNAPSHOT_DESCRIPTION
  });
  console.log(new Date(), "wait for template snapshot ready...")
  await waitSnapshotReady(snapshot.SNAPSHOTID);
  console.log(new Date(), "cleanup things...");
  await vultr.server.delete({SUBID: parseInt(vps.SUBID)});
  await vultr.sshkey.delete({SSHKEYID: sshkey.id});
  fs.unlinkSync(SSH_KEY_PATH);
  fs.unlinkSync(SSH_KEY_PATH + ".pub");
  console.log("snapshot id:", snapshot.SNAPSHOTID);
  fs.writeFileSync(VULTR_TEMPLATE_SNAPSHOT_ID_PATH, snapshot.SNAPSHOTID);
  return snapshot.SNAPSHOTID;
}
async function genServer(sshkey){
  console.log(new Date(), "create worker vps..")
  const ssh = new Ssh();
  let vps = await vultr.server.create({
    OSID, VPSPLANID, DCID: REGIONID, SSHKEYID: sshkey.id, label: VULTR_PROXY_WORKER_VPS_LABEL,
  });
  vps = await waitVpsServerReady(vps.SUBID);
  console.log(new Date(), "ip of worker vps: ", vps.main_ip);
  while(!ssh.isConnected()){
    try{
      await ssh.connect({
        host: vps.main_ip,
        username: 'root',
        privateKey: sshkey.privateKey
      })
    } catch(e) {
      console.log(e);
      await new Promise(r => setTimeout(r, 1000));
    }
  } 
  console.log(new Date(), "run startup script...");
  await ssh.putDirectory('data', '/var/app', { validate: (itemPath) => path.basename(itemPath) !== 'node_modules' });
  let res = await ssh.execCommand('sh startup_script.sh', {cwd: '/var/app'});
  ssh.dispose();
  return vps;
}

class VultrDeployment extends Deployment {
  async deploy() {
    this.deployingPromise = null;
    if(VultrDeployment.sshkey == null){
      VultrDeployment.sshkey = await genSshKey();
    }
    this.deployingPromise = genServer(VultrDeployment.sshkey);
    let vps = await this.deployingPromise;
    this.id = vps.SUBID;
    this._address = "http://" + vps.main_ip + ":80";
  }
  address() {
    return this._address;
  }
  isAlive() {
    return true;
  }
  async destroy(immediately) {
    if(!immediately)
      await new Promise(r => setTimeout(r, 60000));
    let vps = await this.deployingPromise;
    await vultr.server.delete({SUBID: parseInt(vps.SUBID)});
  }
}

module.exports = VultrDeployment;
