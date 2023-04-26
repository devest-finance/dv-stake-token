const AccountHelper = require("./helpers/Helper");

const ERC20 = artifacts.require("ERC20PresetFixedSupply");
const DvStakeToken = artifacts.require("DvStakeToken");
const DvStakeTokenFactory = artifacts.require("DvStakeTokenFactory");

var exampleModelAddress = null;

contract('Bid Orders', (accounts) => {

    let erc20Token;
    let stakeTokenFactory;
    let modelOneDeVestDAO;
    let modelOneInstance;

    before(async () => {
        erc20Token = await ERC20.deployed();
        stakeTokenFactory = await DvStakeTokenFactory.deployed();

        // fetch devest
        const devestDAOAddress = await stakeTokenFactory.getRoyalty.call();
        modelOneDeVestDAO = await DvStakeToken.at(devestDAOAddress[1]);

        // setup accounts
        await AccountHelper.setupAccountFunds(accounts, erc20Token, 40000000000);
        modelOneInstance = await AccountHelper.createTangible(stakeTokenFactory, erc20Token.address,
            "Example", "EXP", 3000000000, 100, 0,  accounts[0]);
        exampleModelAddress = modelOneInstance.address;
    });

    it('Submit Buy Orders', async () => {
        // submit buy order
        const pricePerShare = 30000000;
        const amountOfShares = 50;
        const totalPrice = pricePerShare * amountOfShares;
        const escrow = totalPrice + ((totalPrice) * 0.1); // totalPrice + tax (10%)

        await erc20Token.approve(modelOneInstance.address, escrow, { from: accounts[2] });
        await modelOneInstance.buy(pricePerShare, 50, { from: accounts[2] });

        // tangible funds should increase
        const fundsTangible = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(fundsTangible, escrow, "Invalid funds after submitting buy order");

        const orders = await modelOneInstance.getOrders.call();
        const order = await modelOneInstance.orders.call(orders[0]);
        assert.equal(orders.length, 1, "Order not stored");
        assert.equal(order.price, pricePerShare, "Order has invalid price");
    });

    it('Accept Bid Orders (A)', async () => {
        // --- before
        const fundsOwnerBefore = (await erc20Token.balanceOf.call(accounts[0])).toNumber();

        // fetch orders
        const orders = await modelOneInstance.getOrders.call();
        await modelOneInstance.accept(orders[0], 50, { from: accounts[0], value: 10000000 });

        // check if tax was paid
        const tax = 150000000;

        // check if owner got funds back
        const fundsOwnerAfter = (await erc20Token.balanceOf.call(accounts[0])).toNumber();
        assert.equal(fundsOwnerAfter, fundsOwnerBefore + (150000000 * 10) + tax, "Seller (owner) received invalid amount for swap");

        // no more funds on tangible ( all spend )
        const fundsTangible = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(fundsTangible, 0, "Invalid funds on tangible after accept");

        const value = (await modelOneInstance.value.call()).toNumber();
        assert.equal((value/100), 30000000, "Invalid price, in PreSale phase");

        const share = (await modelOneInstance.getShares.call(accounts[2])).toNumber();
        assert.equal(share, 50, "Invalid share of staker");
    })

    it('Check if orders been closed', async () => {
        const orders = await modelOneInstance.getOrders.call();
        assert.equal(orders.length, 0, "Buy order not closed");

        const sharedholders = await modelOneInstance.getShareholders.call();
        assert.equal(sharedholders.length, 2, "New shareholder not included in shareholders");
    });

    it('Check if fees been collected in DeVest DAO', async () => {
        const balance = await web3.eth.getBalance(modelOneDeVestDAO.address);
        assert.equal(balance, 20000000, "No Fees been paid to DAO");
    });

});
