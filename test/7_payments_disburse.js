const AccountHelper = require("./helpers/Helper");

const ERC20 = artifacts.require("ERC20PresetFixedSupply");
const DvStakeToken = artifacts.require("DvStakeToken");
const DvStakeTokenFactory = artifacts.require("DvStakeTokenFactory");

var exampleModelAddress = null;


contract('Disburse Payments', (accounts) => {

    let erc20Token;
    let modelOneFactory;
    let modelOneDeVestDAO;
    let modelOneInstance;

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

    it('Distribute some shares', async () => {
        await modelOneInstance.transfer(accounts[1], 30, { from: accounts[0], value: 10000000 });
        await modelOneInstance.transfer(accounts[2], 10, { from: accounts[0], value: 10000000 });

        assert.equal(await AccountHelper.getShares(modelOneInstance, accounts[0]), 60, "Invalid shares on owner");
        assert.equal(await AccountHelper.getShares(modelOneInstance, accounts[1]), 30, "Invalid shares on owner");
        assert.equal(await AccountHelper.getShares(modelOneInstance, accounts[2]), 10, "Invalid shares on owner");
    });

    it('Pay', async () => {
        // create a bid to have escrow, which should remain
        const value = (await modelOneInstance.value.call()).toNumber();
        const price = value / 100;
        await AccountHelper.createERCBuyOrder(erc20Token,modelOneInstance, 5, price, accounts[3])

        // balance before pay (from escrow)
        const balance = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();

        // pay
        await erc20Token.approve(modelOneInstance.address, 200000000, { from: accounts[8] })
        await modelOneInstance.pay(200000000, { from: accounts[8], value: 10000000 });

        // balance after pay should be escrow + pay
        const balanceAfterPay = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(balanceAfterPay, balance + (200000000*0.9), "Failed paying in tst");
    })

    it('Withdraw Dividends', async () => {
        const fundsTangibleBefore = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();

        // call disburse
        await modelOneInstance.disburse({ from: accounts[0] });

        // collect current funds of shareholders before dividends are paid
        const shareholders = await modelOneInstance.getShareholders.call();
        assert.equal(shareholders.length, 3, "Invalid amount of Shareholders");

        // withdraw
        const split = 200000000 * 0.9; // remove tax
        const disburseLevel = await modelOneInstance.disburseLevels.call(0);
        assert.equal(split, disburseLevel.toNumber(), "Invalid amount disbursed");

        for(let shareholder of shareholders){
            const balanceBefore = (await erc20Token.balanceOf.call(shareholder)).toNumber();
            const shares = (await modelOneInstance.getShares.call(shareholder)).toNumber();
            await modelOneInstance.withdraw({ from : shareholder });
            const after = (await erc20Token.balanceOf.call(shareholder)).toNumber();
            const d = (shares *  split) / 100;
            const same = balanceBefore + d == after;
            assert.equal(balanceBefore + d, after, "Invalid dividends disbursed");
        }

        const fundsTangibleAfter = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(fundsTangibleBefore, fundsTangibleAfter + (200000000*0.9), "Failed paying in tst");
    })

    it('Terminate Share', async () => {
        // call terminate until 50% reached
        await modelOneInstance.terminate({ from: accounts[0] })

        state = await modelOneInstance.terminated.call();
        assert.equal(state, true, "Contract should be terminated");
    });

    it('Check if fees been collected in DeVest DAO', async () => {
        const balance = await web3.eth.getBalance(modelOneDeVestDAO.address);
        assert.equal(balance, 40000000, "No Fees been paid to DAO");
    });

});
