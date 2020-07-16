class Deployment {
  constructor() {}
  async deploy() {
    throw new Error("Not implemented");
  }
	address() { // -> proxy address
    throw new Error("Not implemented");
	}
  isAlive() {
    throw new Error("Not implemented");
  }
  async detroy(immediately) {
    throw new Error("Not implemented");
	}
}

module.exports = Deployment;
