curl -sL https://rpm.nodesource.com/setup_12.x | bash -
yum install -y nodejs
npm install
sudo firewall-cmd --add-service=http --permanent
sudo firewall-cmd --reload
npm install -g forever forever-service
forever-service install proxy --script index.js
service proxy start
