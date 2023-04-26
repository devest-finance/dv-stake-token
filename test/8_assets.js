const AccountHelper = require("./helpers/Helper");

const ERC20 = artifacts.require("ERC20PresetFixedSupply");
const DvStakeToken = artifacts.require("DvStakeToken");
const DvStakeTokenFactory = artifacts.require("DvStakeTokenFactory");

var exampleModelAddress = null;

contract('Assets', (accounts) => {

    let erc20Token;
    let stakeTokenFactory;
    let modelOneDeVestDAO;
    let modelOneInstance;

    let secondToken;
    let thirdToken;

    before(async () => {
        erc20Token = await ERC20.deployed();
        stakeTokenFactory = await DvStakeTokenFactory.deployed();

        // fetch devest
        const devestDAOAddress = await stakeTokenFactory.getRoyalty.call();
        modelOneDeVestDAO = await DvStakeToken.at(devestDAOAddress[1]);

        await AccountHelper.setupAccountFunds(accounts, erc20Token, 40000000000);
        modelOneInstance = await AccountHelper.createTangible(stakeTokenFactory, erc20Token.address,
            "Example", "EXP", 3000000000, 100, 0,  accounts[0]);
        exampleModelAddress = modelOneInstance.address;
    });

    it('Issue 2 Asset tokens', async () => {
        secondToken = await AccountHelper.createERCToken("ERC20 Token #1", "TK1",
            1000000000, "0xECF5A576A949aEE5915Afb60E0e62D09825Cd61B", accounts[0]);
        thirdToken = await AccountHelper.createERCToken("ERC20 Token #2", "TK2",
            1000000000, "0xECF5A576A949aEE5915Afb60E0e62D09825Cd61B", accounts[0]);

        // Get balances of first and second account after the transactions.
        const accountBalance1 = (await secondToken.balanceOf.call(accounts[0])).toNumber();
        const accountBalance2 = (await thirdToken.balanceOf.call(accounts[0])).toNumber();

        assert.equal(accountBalance1, 1000000000, "Token balance invalid");
        assert.equal(accountBalance2, 1000000000, "Token balance invalid");
    });

    it('Deploy model-one with Assets', async () => {
        const exampleOneContract = await stakeTokenFactory.issue(erc20Token.address, "Example", "EXP", { value: 100000000 });
        exampleModelAddress = exampleOneContract.logs[0].args[1];

        modelOneInstance = await DvStakeToken.at(exampleModelAddress);
        const symbol = await modelOneInstance.symbol.call();

        assert.equal(symbol, "% EXP", "Failed to issue Example Contract");
    });

    it('Transfer Tokens to Tangible', async () => {
        await secondToken.approve(modelOneInstance.address, 100000, { from: accounts[0] });
        await thirdToken.approve(modelOneInstance.address, 100000, { from: accounts[0] });

        await modelOneInstance.addAsset(secondToken.address, 10000, { from: accounts[0] });
        await modelOneInstance.addAsset(thirdToken.address, 100, { from: accounts[0] });

        const asset = await modelOneInstance.assets.call(1);
        assert.equal(asset.amount.toNumber(), 100, "Invalid amount of Tokens");
    })

    it('should Setup Tangible', async () => {
        await modelOneInstance.initialize(3000000000, 10, 0, { from: accounts[0] });

        const value = (await modelOneInstance.value.call()).toNumber();
        assert.equal(value, 3000000000, "Invalid price on initialized tangible");
    })

    it('Distribute some shares', async () => {
        await modelOneInstance.transfer(accounts[1], 30, { from: accounts[0], value: 10000000 });
        await modelOneInstance.transfer(accounts[2], 10, { from: accounts[0], value: 10000000 });

        assert.equal(await AccountHelper.getShares(modelOneInstance, accounts[0]), 60, "Invalid shares on owner");
        assert.equal(await AccountHelper.getShares(modelOneInstance, accounts[1]), 30, "Invalid shares on owner");
        assert.equal(await AccountHelper.getShares(modelOneInstance, accounts[2]), 10, "Invalid shares on owner");
    });

    it('Terminate the TST to withdraw tokens', async () => {
        await modelOneInstance.terminate();

        const state = await modelOneInstance.terminated.call();
        assert.equal(state, true, "Contract should be terminated");
    });

    it('Withdraw Dividends', async () => {
        const fundsTangibleBefore = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();

        // call disburse (not required as done with termination)
        // await modelOneInstance.disburse({ from: accounts[0] });

        // collect current funds of shareholders before dividends are paid
        const shareholders = await modelOneInstance.getShareholders.call();
        assert.equal(shareholders.length, 3, "Invalid amount of Shareholders");

        // withdraw
        await modelOneInstance.withdraw({ from : shareholders[1] });
        const balance1 = (await secondToken.balanceOf.call(shareholders[1])).toNumber();
        const balance2 = (await thirdToken.balanceOf.call(shareholders[1])).toNumber();

        assert.equal(balance1, 3000, "Received invalid amount of Assets on withdraw");
        assert.equal(balance2, 30, "Received invalid amount of Assets on withdraw");
    })

    it('Check if fees been collected in DeVest DAO', async () => {
        const balance = await web3.eth.getBalance(modelOneDeVestDAO.address);
        assert.equal(balance, 40000000, "No Fees been paid to DAO");
    });

});
