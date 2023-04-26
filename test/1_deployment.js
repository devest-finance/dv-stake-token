const DvStakeToken = artifacts.require("DvStakeToken");
const DvStakeTokenFactory = artifacts.require("DvStakeTokenFactory");


const ERC20 = artifacts.require("ERC20PresetFixedSupply");

var devestDAOAddress = null;
var exampleModelAddress = null;

contract('Testing Deployments', (accounts) => {

    it('Verify root (DeVest) DAO was deployed', async () => {
        const dvStakeTokenFactory = await DvStakeTokenFactory.deployed();
        const devestDAOAddress = await dvStakeTokenFactory.getRoyalty.call();

        const devestDAO = await DvStakeToken.at(devestDAOAddress[1]);
        const symbol = await devestDAO.symbol.call();

        assert.equal(symbol, "% DeVest DAO", "Failed to issue DeVest DAO Contract");
    });

    it('Deploy DvStakeToken as DAO (Token)', async () => {
        const modelOneFactory = await DvStakeTokenFactory.deployed();
        const erc20Token = await ERC20.deployed();

        const exampleOneContract = await modelOneFactory.issue(erc20Token.address, "Example", "EXP", { value: 100000000 });
        exampleModelAddress = exampleOneContract.logs[0].args[1];

        const devestDAO = await DvStakeToken.at(exampleModelAddress);
        const symbol = await devestDAO.symbol.call();

        assert.equal(symbol, "% EXP", "Failed to issue Example Contract");
    });

    it('Check DvStakeToken', async () => {
        const devestOne = await DvStakeToken.at(exampleModelAddress);

        // check if variables set
        const name = await devestOne.name.call();
        assert(name, "Example", "Invalid name on TST");

        await devestOne.initialize(3000000000, 10, 0, { from: accounts[0] });

        const value = (await devestOne.value.call()).toNumber();
        assert.equal(value, 3000000000, "Invalid price on initialized tangible");
    });

    it('Check DvStakeToken Detach', async () => {
        const stakeTokenFactory = await DvStakeTokenFactory.deployed();
        const erc20Token = await ERC20.deployed();

        // devest shares
        const devestDAOAddress = await stakeTokenFactory.getRoyalty.call();
        const DeVestDAO = await DvStakeToken.at(devestDAOAddress[1]);

        // issue new product
        const exampleOneContract = await stakeTokenFactory.issue(erc20Token.address, "Example", "EXP", { from: accounts[0], value: 100000000 });
        exampleModelAddress = exampleOneContract.logs[0].args[1];
        const subjectContract = await DvStakeToken.at(exampleModelAddress);
        await subjectContract.initialize(1000000000, 10, 0, { from: accounts[0] });

        const balanceBefore = await web3.eth.getBalance(DeVestDAO.address);
        assert.equal(balanceBefore, 20000000, "Invalid balance on DeVest before DAO");

        // check if royalty are paid
        await subjectContract.transfer(accounts[1], 50, { from: accounts[0], value: 100000000 });
        const balance = await web3.eth.getBalance(DeVestDAO.address);
        assert.equal(balance, 30000000, "Transfer royalties failed");

        // detach from factory
        await stakeTokenFactory.detach(subjectContract.address);

        // check if royalty are paid
        await subjectContract.transfer(accounts[1], 50, { from: accounts[0], value: 100000000 });
        const balanceDetached = await web3.eth.getBalance(DeVestDAO.address);
        assert.equal(balanceDetached, 30000000, "Transfer royalties failed");

    });


});
