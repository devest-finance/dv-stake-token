const AccountHelper = require("./helpers/Helper");

const ERC20 = artifacts.require("ERC20PresetFixedSupply");
const DvStakeToken = artifacts.require("DvStakeToken");
const DvStakeTokenFactory = artifacts.require("DvStakeTokenFactory");

var exampleModelAddress = null;

contract('Mixed Orders', (accounts) => {

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
        await erc20Token.approve(modelOneInstance.address, 30 * 1000, { from: accounts[2] });
        await erc20Token.approve(modelOneInstance.address, 30 * 1000, { from: accounts[3] });
        await erc20Token.approve(modelOneInstance.address, 30 * 1000, { from: accounts[4] });
        await erc20Token.approve(modelOneInstance.address, 20 * 1000, { from: accounts[5] });
        await modelOneInstance.purchase(30, {from: accounts[2] });
        await modelOneInstance.purchase(30, {from: accounts[3] });
        await modelOneInstance.purchase(30, {from: accounts[4] });
        try{
            await modelOneInstance.purchase(20, {from: accounts[5] });}
        catch (ex){
            assert.equal(ex.reason, "Not enough shares left to purchase", "Invalid error message");
        }

        const fundsTangible = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(fundsTangible, 90 * 1000, "Invalid funds submitting buy orders");

        // check shares of buyers
        const shares1 = (await modelOneInstance.balanceOf.call(accounts[2])).toNumber();
        const shares2 = (await modelOneInstance.balanceOf.call(accounts[3])).toNumber();
        const shares3 = (await modelOneInstance.balanceOf.call(accounts[4])).toNumber();
        const shares4 = (await modelOneInstance.balanceOf.call(accounts[5])).toNumber();
        assert.equal(shares1, 30, "Invalid shares of buyer 2");
        assert.equal(shares2, 30, "Invalid shares of buyer 3");
        assert.equal(shares3, 30, "Invalid shares of buyer 4");
        assert.equal(shares4, 0, "Invalid shares of buyer 5");

        // check trading not possible
        try {
            await modelOneInstance.sell(price, 10, {from: accounts[2]});
        } catch (ex){
            assert.equal(ex.reason, "Trading not active", "Invalid error message");
        }
    });

    it('Complete pre-sale and trade', async () => {
        // Purchase the last part and complete pre-sale
        await modelOneInstance.purchase(10, {from: accounts[5] });

        // check if presale ended and trading started
        const tradingActive = await modelOneInstance.trading.call();
        assert.equal(tradingActive, true, "Trading should be active");

        const presaleActive = await modelOneInstance.presale.call();
        assert.equal(presaleActive, false, "Presale should be ended");

        // check if owner got funds and has no shares
        const fundsOwner = (await erc20Token.balanceOf.call(accounts[0])).toNumber();
        assert.equal(fundsOwner, 680000100000, "Invalid funds for owner");

        const sharesOwner = (await modelOneInstance.balanceOf.call(accounts[0])).toNumber();
        assert.equal(sharesOwner, 0, "Invalid shares of owner");

        // check shares of buyers
        const shares1 = (await modelOneInstance.balanceOf.call(accounts[2])).toNumber();
        const shares2 = (await modelOneInstance.balanceOf.call(accounts[3])).toNumber();
        const shares3 = (await modelOneInstance.balanceOf.call(accounts[4])).toNumber();
        const shares4 = (await modelOneInstance.balanceOf.call(accounts[5])).toNumber();
        assert.equal(shares1, 30, "Invalid shares of buyer 2");
        assert.equal(shares2, 30, "Invalid shares of buyer 3");
        assert.equal(shares3, 30, "Invalid shares of buyer 4");
        assert.equal(shares4, 10, "Invalid shares of buyer 5");
    });

    it('Submit buy and sell orders', async () => {

    });



});
