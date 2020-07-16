const VultrNode = require('@vultr/vultr-node')
const vultr = VultrNode.initialize({
  apiKey: "DNBT4GNZGW4WPQPY4NARSFLCY6PFIL4E5CDQ",
});
(async () =>{
  let sshkeys = await vultr.sshkey.list()
  console.log(sshkeys);
})();
