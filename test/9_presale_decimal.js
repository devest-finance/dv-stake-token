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
            "Example", "EXP", null, 100, 2, 100000000, accounts[0]);
        exampleModelAddress = modelOneInstance.address;
    });

    it('Check if there are no shareholders', async () => {
        const shareholders = await modelOneInstance.getShareholders.call();
        assert.equal(shareholders.length, 0, "Invalid number of shareholders");
    });

    it('Purchase shares from pre-sale', async () => {
        const price = (await modelOneInstance.presalePrice.call()).toNumber();

        const amount = 1 * Math.pow(10, 2);  // 10%
        const totalPrice = amount * price;

        // allow token to spend funds
        await erc20Token.approve(modelOneInstance.address, totalPrice, { from: accounts[2] });
        await modelOneInstance.purchase(amount, {from: accounts[2] });

        const shareholders = await modelOneInstance.getShareholders.call();
        assert.equal(shareholders.length, 1, "Invalid number of shareholders");
    });

    it('Purchase shares from pre-sale', async () => {
        const price = (await modelOneInstance.presalePrice.call()).toNumber();

        const amount = 1 * Math.pow(10, 2);  // 10%
        const totalPrice = amount * price;

        // allow token to spend funds
        await erc20Token.approve(modelOneInstance.address, totalPrice, { from: accounts[0] });
        await modelOneInstance.purchase(amount, {from: accounts[0] });

        const shareholders = await modelOneInstance.getShareholders.call();
        assert.equal(shareholders.length, 2, "Invalid number of shareholders");
    });


});
