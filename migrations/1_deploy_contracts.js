const DvStakeToken = artifacts.require("DvStakeToken");
const DvStakeTokenFactory = artifacts.require("DvStakeTokenFactory");
const ERC20PresetFixedSupply = artifacts.require("ERC20PresetFixedSupply");

module.exports = function(deployer) {
    if (deployer.network === 'development') {
        deployer.deploy(DvStakeTokenFactory)
            .then(() => deployer.deploy(ERC20PresetFixedSupply, "ERC20 Token", "TKO", 1000000000000, "0xECF5A576A949aEE5915Afb60E0e62D09825Cd61B"))
            .then(() => ERC20PresetFixedSupply.deployed())
            .then(async _instance => {})
            .then(() => DvStakeTokenFactory.deployed())
            .then(async _instance => {
                    const devestDAOImp = await _instance.issue("0x0000000000000000000000000000000000000000", "DeVest DAO", "DeVest DAO");
                    //await _instance.setRoot(devestDAOImp.logs[0].args[1], { from: "0xECF5A576A949aEE5915Afb60E0e62D09825Cd61B" });
                    //await _instance.setRoyalty(100000000);
                    const devestDAO = await DvStakeToken.at(devestDAOImp.logs[0].args[1]);
                    await devestDAO.initialize(10000000, 10, 0, { from: "0xECF5A576A949aEE5915Afb60E0e62D09825Cd61B" });

                    await _instance.setRoyalty(10000000, 10000000);
                    await _instance.setRecipient(devestDAOImp.logs[0].args[1]);
                }
            )
    } else {
      deployer.deploy(DvStakeTokenFactory)
          .then(() => DvStakeTokenFactory.deployed())
          .then(async _instance => {
              //await _instance.setFee(10000000);
          });
  }
};
