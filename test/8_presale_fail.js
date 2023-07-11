const AccountHelper = require("./helpers/Helper");

const ERC20 = artifacts.require("ERC20PresetFixedSupply");
const DvStakeToken = artifacts.require("DvStakeToken");
const DvStakeTokenFactory = artifacts.require("DvStakeTokenFactory");

var exampleModelAddress = null;

contract('Presale - terminated', (accounts) => {

    let erc20Token;
    let stakeTokenFactory;
    let modelOneDeVestDAO;
    let modelOneInstance;

    before(async () => {
        erc20Token = await ERC20.deployed();
        stakeTokenFactory = await DvStakeTokenFactory.deployed();

        // fetch devest
        const devestDAOAddress = await stakeTokenFactory.getRecipient.call();
        modelOneDeVestDAO = await DvStakeToken.at(devestDAOAddress);

        await AccountHelper.setupAccountFunds(accounts, erc20Token, 40000000000);
        modelOneInstance = await AccountHelper.createTangiblePresale(stakeTokenFactory, erc20Token.address,
            "Example", "EXP", 3000000000, 100, 0, 1000, accounts[0]);
        exampleModelAddress = modelOneInstance.address;
    });

    it('Purchase shares from pre-sale', async () => {
        const price = 1000;

        const funds1BeforeWithdraw = (await erc20Token.balanceOf.call(accounts[2])).toNumber();

        // allow token to spend funds
        await erc20Token.approve(modelOneInstance.address, 10 * 1000, { from: accounts[2] });
        await erc20Token.approve(modelOneInstance.address, 20 * 1000, { from: accounts[3] });
        await erc20Token.approve(modelOneInstance.address, 30 * 1000, { from: accounts[4] });
        await modelOneInstance.purchase(10, {from: accounts[2] });
        await modelOneInstance.purchase(20, {from: accounts[3] });
        await modelOneInstance.purchase(30, {from: accounts[4] });

        const fundsTangible = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(fundsTangible, 60000, "Invalid funds submitting buy orders");

        // check shares of buyers
        const shares1 = (await modelOneInstance.balanceOf.call(accounts[2])).toNumber();
        const shares2 = (await modelOneInstance.balanceOf.call(accounts[3])).toNumber();
        const shares3 = (await modelOneInstance.balanceOf.call(accounts[4])).toNumber();
        assert.equal(shares1, 10, "Invalid shares of buyer 2");
        assert.equal(shares2, 20, "Invalid shares of buyer 3");
        assert.equal(shares3, 30, "Invalid shares of buyer 4");

        // check trading not possible
        try {
            await modelOneInstance.sell(price, 10, {from: accounts[2]});
        } catch (ex){
            assert.equal(ex.reason, "Not available in current state", "Invalid error message");
        }
    });

    it('Terminate presale, all funds returned', async () => {
        // call withdraw before termination
        const funds1Before = (await erc20Token.balanceOf.call(accounts[2])).toNumber();
        try {
            await modelOneInstance.withdraw({ from: accounts[2] });
        } catch (ex){
            assert.equal(ex.reason, "Nothing to disburse", "Invalid error message");
        }
        const funds1After = (await erc20Token.balanceOf.call(accounts[2])).toNumber();
        assert.equal(funds1After, funds1Before, "Invalid funds of buyer 2");

        // terminate presale
        await modelOneInstance.terminate({ from: accounts[0] });

        // withdraw funds
        await modelOneInstance.withdraw({ from: accounts[2] });
        await modelOneInstance.withdraw({ from: accounts[3] });
        await modelOneInstance.withdraw({ from: accounts[4] });

        // check balance of tokens of buyers
        const funds1 = (await erc20Token.balanceOf.call(accounts[2])).toNumber();
        const funds2 = (await erc20Token.balanceOf.call(accounts[3])).toNumber();
        const funds3 = (await erc20Token.balanceOf.call(accounts[4])).toNumber();
        assert.equal(funds1, 40000000000, "Invalid funds of buyer 2");
        assert.equal(funds2, 40000000000, "Invalid funds of buyer 3");
        assert.equal(funds3, 40000000000, "Invalid funds of buyer 4");
    });

});
