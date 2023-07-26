const AccountHelper = require("./helpers/Helper");

const ERC20 = artifacts.require("ERC20PresetFixedSupply");
const DvStakeToken = artifacts.require("DvStakeToken");
const DvStakeTokenFactory = artifacts.require("DvStakeTokenFactory");

var exampleModelAddress = null;

contract('Presale - successful', (accounts) => {

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
            "Example", "EXP", 3000000000, 100, 2, 1000, accounts[0]);
        exampleModelAddress = modelOneInstance.address;
    });

    it('Purchase shares from pre-sale', async () => {
        const price = 1000;

        const funds1BeforeWithdraw = (await erc20Token.balanceOf.call(accounts[2])).toNumber();

        // allow token to spend funds
        await erc20Token.approve(modelOneInstance.address, 3000 * 1000, { from: accounts[2] });
        await erc20Token.approve(modelOneInstance.address, 3000 * 1000, { from: accounts[3] });
        await erc20Token.approve(modelOneInstance.address, 3000 * 1000, { from: accounts[4] });
        await erc20Token.approve(modelOneInstance.address, 2000 * 1000, { from: accounts[5] });
        await modelOneInstance.purchase(3000, {from: accounts[2] });
        await modelOneInstance.purchase(3000, {from: accounts[3] });
        await modelOneInstance.purchase(3000, {from: accounts[4] });
        try{
            await modelOneInstance.purchase(2000, {from: accounts[5] });}
        catch (ex){
            assert.equal(ex.reason, "Not enough shares left to purchase", "Invalid error message");
        }

        const fundsTangible = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(fundsTangible, 9000 * 1000, "Invalid funds submitting buy orders");

        // check shares of buyers
        const shares1 = (await modelOneInstance.balanceOf.call(accounts[2])).toNumber();
        const shares2 = (await modelOneInstance.balanceOf.call(accounts[3])).toNumber();
        const shares3 = (await modelOneInstance.balanceOf.call(accounts[4])).toNumber();
        const shares4 = (await modelOneInstance.balanceOf.call(accounts[5])).toNumber();
        assert.equal(shares1, 3000, "Invalid shares of buyer 2");
        assert.equal(shares2, 3000, "Invalid shares of buyer 3");
        assert.equal(shares3, 3000, "Invalid shares of buyer 4");
        assert.equal(shares4, 0, "Invalid shares of buyer 5");

        // check trading not possible
        try {
            await modelOneInstance.sell(price, 10, {from: accounts[2]});
        } catch (ex){
            assert.equal(ex.reason, "Not available in current state", "Invalid error message");
        }
    });

    it('Complete pre-sale and trade', async () => {
        // Purchase the last part and complete pre-sale
        await modelOneInstance.purchase(1000, {from: accounts[5] });

        // check if presale ended and trading started
        const tradingActive = await modelOneInstance.state.call();
        assert.equal(tradingActive, 2, "Trading should be active");

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

    it('Sell the purchased shares', async () => {
        // Sell purchesed shares
        
        const pricePerShare = 40000000;
        const amountOfShares = 10;

        await modelOneInstance.sell(pricePerShare, 10, {from: accounts[2]});
        
        const sharesOwner = (await modelOneInstance.balanceOf.call(accounts[2])).toNumber();
        assert.equal(sharesOwner, 20, "Invalid shares of owner");

        // check shares of buyers
        const shares1 = (await modelOneInstance.balanceOf.call(accounts[2])).toNumber();
        const shares2 = (await modelOneInstance.balanceOf.call(accounts[3])).toNumber();
        const shares3 = (await modelOneInstance.balanceOf.call(accounts[4])).toNumber();
        const shares4 = (await modelOneInstance.balanceOf.call(accounts[5])).toNumber();
        assert.equal(shares1, 20, "Invalid shares of buyer 2");
        assert.equal(shares2, 30, "Invalid shares of buyer 3");
        assert.equal(shares3, 30, "Invalid shares of buyer 4");
        assert.equal(shares4, 10, "Invalid shares of buyer 5");

        // check buyer 2 funds before accept
        const funds2BeforeWithdraw = (await erc20Token.balanceOf.call(accounts[2])).toNumber();
        

        // buyer 3 accepts 5 shares from buyer 2 for price
        const totalPrice = pricePerShare * amountOfShares;
        const escrow = totalPrice + ((totalPrice) * 0.1); // totalPrice + tax (10%)
        await erc20Token.approve(modelOneInstance.address, escrow, { from: accounts[3] });
        const orders = await modelOneInstance.getOrders.call();
        const event = await modelOneInstance.accept(orders[0], amountOfShares/2, { from: accounts[3], value: 10000000 });        

        const shares2After = (await modelOneInstance.balanceOf.call(accounts[3])).toNumber();
        assert.equal(shares2After, 35, "Invalid shares of buyer 3");

        // check if buyer 2 got funds
        const funds2AfterWithdraw = (await erc20Token.balanceOf.call(accounts[2])).toNumber();
        assert.equal(funds2AfterWithdraw, funds2BeforeWithdraw + (pricePerShare * amountOfShares/2), "Invalid funds for buyer 2");

        // check escrow of the active order is decreased
        const ordersAfter = await modelOneInstance.getOrders.call();
        const order = await modelOneInstance.orders.call(ordersAfter[0]);
        assert.equal(order[2], 5, "Invalid escrow of active order");


        // check shares of buyer 2 before cancel
        const shares2BeforeCancel = (await modelOneInstance.balanceOf.call(accounts[2])).toNumber();
        assert.equal(shares2BeforeCancel, 20, "Invalid shares of buyer 2");


        // cancel order
        await modelOneInstance.cancel({ from: accounts[2] });
        const ordersAfterCancel = await modelOneInstance.getOrders.call();
        assert.equal(ordersAfterCancel.length, 0, "Invalid order count after cancel");

        // check shares of buyer 2 after cancel
        const shares2AfterCancel = (await modelOneInstance.balanceOf.call(accounts[2])).toNumber();
        assert.equal(shares2AfterCancel, 25, "Invalid shares of buyer 2");


    });



});
