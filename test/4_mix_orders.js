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
        modelOneInstance = await AccountHelper.createTangible(stakeTokenFactory, erc20Token.address,
            "Example", "EXP", 3000000000, 100, 0,  accounts[0]);
        exampleModelAddress = modelOneInstance.address;
    });

    it('Add more buy orders', async () => {
        const value = (await modelOneInstance.value.call()).toNumber();
        const price = value / 100;

        // submit bid
        await AccountHelper.createERCBuyOrder(erc20Token, modelOneInstance, 20, price, accounts[4]);
        await AccountHelper.createERCBuyOrder(erc20Token, modelOneInstance, 10, price * 1.5, accounts[5]);
        await AccountHelper.createERCBuyOrder(erc20Token, modelOneInstance, 18, price * 2, accounts[6]);
        await AccountHelper.createERCBuyOrder(erc20Token, modelOneInstance, 20, price * 0.5, accounts[7]);

        let totalEscrow = 20 * price + (10 * price * 1.5) + (18 * price * 2) + (20 * price * 0.5);
        totalEscrow += (totalEscrow * 10) / 100;

        // tangible funds should increase
        const fundsTangible = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(fundsTangible, totalEscrow, "Invalid funds submitting buy orders");

        const orders = await modelOneInstance.getOrders.call();
        const order = await modelOneInstance.orders.call(orders[2]);
        assert.equal(orders.length, 4, "Order not stored");
        assert.equal(order.price.toNumber(), 60000000, "Order has invalid price");
        // 60400000 || 80000000
    })

    it('Accept bids', async () => {
        let fundsTangible = (await erc20Token.balanceOf.call(accounts[1])).toNumber();
        let fundsOwner = (await erc20Token.balanceOf.call(accounts[0])).toNumber();
        let earningOnwer = 0;
        let taxFactor = 0.1;

        // fetch offers
        let orders = await modelOneInstance.getOrders.call();

        // --- accept #1
        let order = await modelOneInstance.orders.call(orders[0]);
        let spend = order.price * 20;
        await modelOneInstance.accept(orders[0], 20, { from: accounts[0], value: 10000000 });
        earningOnwer += ((await erc20Token.balanceOf.call(accounts[0])).toNumber() - fundsOwner);
        fundsOwner = (await erc20Token.balanceOf.call(accounts[0])).toNumber();
        assert.equal(earningOnwer-spend, spend * taxFactor, "Invalid tax paid to owner");

        // -- Order was filled in full, should now be removed
        orders = await modelOneInstance.getOrders.call();
        assert.equal(orders.length, 3, "Filled order was not cancelled");

        // --- accept #2
        // Order on previous position 1 is still on 1, because first one was filled and swapped with last
        order = await modelOneInstance.orders.call(orders[1]);
        spend = order.price * 10;
        await modelOneInstance.accept(orders[1], 10, { from: accounts[0], value: 10000000 });
        earningOnwer += ((await erc20Token.balanceOf.call(accounts[0])).toNumber() - fundsOwner);
        fundsOwner = (await erc20Token.balanceOf.call(accounts[0])).toNumber();

        // -- Order was filled in full, should now be removed
        orders = await modelOneInstance.getOrders.call();
        assert.equal(orders.length, 2, "Filled order was not cancelled");

        // --- accept #3 (Partial)
        const t = (await modelOneInstance.balanceOf.call(accounts[0])).toNumber();
        await modelOneInstance.accept(orders[0], 10, { from: accounts[0], value: 10000000 });
        earningOnwer += ((await erc20Token.balanceOf.call(accounts[0])).toNumber() - fundsOwner);

        // --- leftover escrow
        // TODO: This total value should be calculated
        fundsTangible = (await erc20Token.balanceOf.call(accounts[0])).toNumber();
        const total = 681320000000;
        assert.equal(fundsTangible, total, "Invalid funds on tangible after accept");

        // --- all shareholders
        const shareholders = await modelOneInstance.getShareholders.call();
        const sharesOnwner = 100 - 20 - 10 - 10;
        const leftSharesOwner = (await modelOneInstance.getShares.call(accounts[0])).toNumber();
        assert.equal(leftSharesOwner, sharesOnwner, "Invalid shares");

        assert.equal(shareholders[1], accounts[4], "Invalid shares");
        assert.equal((await modelOneInstance.getShares.call(accounts[4])).toNumber(), 20, "Invalid shares");

        assert.equal(shareholders[2], accounts[5], "Invalid shares");
        assert.equal((await modelOneInstance.getShares.call(accounts[5])).toNumber(), 10, "Invalid shares");

        assert.equal(shareholders[3], accounts[7], "Invalid shares");
        assert.equal((await modelOneInstance.getShares.call(accounts[7])).toNumber(), 10, "Invalid shares");
    });

    it('Create some Sell Orders', async () => {
        const value = (await modelOneInstance.value.call()).toNumber();
        const price = value / 100;

        const ordersBefore = await modelOneInstance.getOrders.call();

        // submit bid
        await AccountHelper.createERCSellOrder(erc20Token, modelOneInstance, 10, price, accounts[4]);
        await AccountHelper.createERCSellOrder(erc20Token, modelOneInstance, 5, price * 1.5, accounts[5]);

        const ordersAfter = await modelOneInstance.getOrders.call();
        const order = await modelOneInstance.orders.call(ordersAfter[3]);
        assert.equal(ordersAfter.length, 4, "Order not stored");
        assert.equal(order.price.toNumber(), price * 1.5, "Order has invalid price");
    });

    it('Accept ask', async () => {
        let fundsTangible = (await erc20Token.balanceOf.call(accounts[1])).toNumber();
        let fundsOwner = (await erc20Token.balanceOf.call(accounts[0])).toNumber();
        let earningOnwer = 0;
        let taxFactor = 0.1;

        // fetch offers
        let orders = await modelOneInstance.getOrders.call();

        // --- accept #1
        let order = await modelOneInstance.orders.call(orders[2]);
        let totalPrice = order.price * 5 + ((order.price * 5) * 0.1);
        await erc20Token.approve(modelOneInstance.address, totalPrice, { from: accounts[8] });
        await modelOneInstance.accept(orders[2], 5, {from: accounts[8], value: 10000000});

        const newOwner = await modelOneInstance.getShares.call(accounts[8]);
        assert.equal(newOwner, 5, "Didn't receive shares");

        // -- Order was filled in full, should now be removed
        orders = await modelOneInstance.getOrders.call();
        assert.equal(orders.length, 4, "No order should be cancelled");
    });

});
