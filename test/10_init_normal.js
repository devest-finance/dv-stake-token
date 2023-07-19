const AccountHelper = require("./helpers/Helper");

const ERC20 = artifacts.require("ERC20PresetFixedSupply");
const DvStakeToken = artifacts.require("DvStakeToken");
const DvStakeTokenFactory = artifacts.require("DvStakeTokenFactory");

var exampleModelAddress = null;

// account info
let acc_balance = 40000000000; // initial balance of accounts


// contract info
const decimals = 0;
const tax = 100;
const totalSupply = Math.pow(10, decimals + 2); // calculated in contract -> not used in initailization





contract('Testing Normal contract init', (accounts) => {

    before(async () => {
        erc20Token = await ERC20.deployed();
        stakeTokenFactory = await DvStakeTokenFactory.deployed();

        // fetch devest
        const devestDAOAddress = await stakeTokenFactory.getRecipient.call();
        modelOneDeVestDAO = await DvStakeToken.at(devestDAOAddress);
        await AccountHelper.setupAccountFunds(accounts, erc20Token, acc_balance);
        modelOneInstance = await AccountHelper.createTangible(stakeTokenFactory, erc20Token.address, "Example", "EXP", totalSupply, tax, decimals,  accounts[0]);
        exampleModelAddress = modelOneInstance.address;
    });

    it("Check if owner has all shares", async () => {
        // check if owner has 100% of shares (with balanceOf)
        const ownerBalance = await modelOneInstance.balanceOf.call(accounts[0]);
        assert.equal(ownerBalance, totalSupply, "Owner does not have all shares");

        // check if owner has 100% of shares (with getShares)
        const ownerShares = await modelOneInstance.getShares.call(accounts[0]);
        assert.equal(ownerShares, totalSupply, "Owner does not have all shares");


        // check that nobody else has shares
        const otherBalance = await modelOneInstance.balanceOf.call(accounts[2]);
        assert.equal(otherBalance, 0, "Other account has shares");

        // check that there is only one sherholder
        const shareholders = await modelOneInstance.getShareholders.call();
        assert.equal(shareholders.length, 1, "There is more than one shareholder");
    })

    it("Purchase is disabled", async () => {
        const purchaseAmount = 10 * Math.pow(10, decimals); // 10 shares
        // check that owner can't purchase
        try {
            await modelOneInstance.purchase(purchaseAmount, {from: accounts[0]});
        }
        catch (e) {
            assert.equal(e.reason, "Not available in current state", "Purchase is not disabled");
        }

        // check that any other account can't purchase
        try {
            await modelOneInstance.purchase(purchaseAmount, {from: accounts[2]});
        }
        catch (e) {
            assert.equal(e.reason, "Not available in current state", "Purchase is not disabled");
        }
    })

    it("Nothing to disburse or withdraw", async () => {

        // TO-DO: check that only sherholders can disburse???
        // account 2 is not a shareholder and should not be able to disburse
        // try {
        //     const event = await modelOneInstance.disburse({from: accounts[2]});
        //     assert.equal(event, null, "Account 2 was able to disburse");
        // }
        // catch (e) {
        //     assert.equal(e.reason, "No shares available", "Withdraw is not disabled");
        // }

        // should be nothing to disburse
        await modelOneInstance.disburse({from: accounts[0]});

        // check that owner can't withdraw
        try {
            await modelOneInstance.withdraw({from: accounts[0]});
        } catch (e) {
            assert.equal(e.reason, "Nothing to disburse", "Withdraw is not disabled");
        }

        // check that any other account can't withdraw
        try {
            await modelOneInstance.withdraw({from: accounts[2]});
        }
        catch (e) {
            assert.equal(e.reason, "No shares available", "Withdraw is not disabled");
        }
    })


    it("Pay", async () => {
        const payment = 200000000; // payment amount

        // allowenace for account 2 to be able to pay
        await erc20Token.approve(modelOneInstance.address, payment, { from: accounts[8] })
        const allowance = await erc20Token.allowance.call(accounts[8], modelOneInstance.address);
        assert.equal(allowance, payment, "Allowance is not correct");      

        
        const ownerBalanceBefore = (await erc20Token.balanceOf.call(accounts[0])).toNumber();

        await modelOneInstance.pay(payment, {from: accounts[8], value: 10000000});
        
        // // check that contract recived payment
        const contractBalance = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalance, payment * 0.9, "Contract has incorrect balance");

        const royalties = payment * 0.1;

        // check that the owner got tax
        const ownerBalanceAfter = (await erc20Token.balanceOf.call(accounts[0])).toNumber();
        assert.equal(ownerBalanceAfter, ownerBalanceBefore + royalties, "Owner did not get tax");

    })

    it("Disburse and don't withdraw", async () => {    
        // nothing to disburse
        try {
            await modelOneInstance.withdraw({from: accounts[0]});
        }
        catch (e) {
            assert.equal(e.reason, "Nothing to disburse", "There is something to disburse");
        }

        // contract balance before disburse
        const contractBalanceBefore = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();

        await modelOneInstance.disburse({from: accounts[0]});

        const contractBalance = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalance, contractBalanceBefore, "Contract has incorrect balance");
    });

    it("Make more payments and withdraw, check one withdraw level after disburse", async () => {
        // make another payment
        const payment = 250000000; // payment amount

        // allowenace for account 2 to be able to pay
        await erc20Token.approve(modelOneInstance.address, payment, { from: accounts[8] })
        const allowance = await erc20Token.allowance.call(accounts[8], modelOneInstance.address);

        const ownerBalanceBefore = (await erc20Token.balanceOf.call(accounts[0])).toNumber();

        // contract balance before payment
        const contractBalanceBefore = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();

        await modelOneInstance.pay(payment, {from: accounts[8], value: 10000000});

        // check that contract recived payment
        const contractBalance = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalance, contractBalanceBefore + payment * 0.9, "Contract has incorrect balance");


        // withdraw
        await modelOneInstance.withdraw({from: accounts[0]});


        // contract balance before withdraw
        const contractBalanceAfter = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalanceAfter, payment * 0.9, "Contract has incorrect balance");

        // check that the owner got payed
        const ownerBalanceAfter = (await erc20Token.balanceOf.call(accounts[0])).toNumber();
        assert.equal(ownerBalanceAfter, contractBalanceBefore + ownerBalanceBefore + payment * 0.1, "Owner did not get payed");
    });


    it("Sell shares make new payemnts and withdraw everything", async () => {
        // sell shares
        const sharesToSell = 20 * Math.pow(10, decimals);
        const price = 100000;
        const sharesBought = sharesToSell - 5 * Math.pow(10, decimals);


        // do another disburse
        await modelOneInstance.disburse({from: accounts[0]});

        // check owner shares before selling, should be 100% total supply
        const ownerSharesBefore = await modelOneInstance.getShares.call(accounts[0]);
        assert.equal(ownerSharesBefore, totalSupply, "Owner does not have all shares");
        
        
        await modelOneInstance.sell(price, sharesToSell, {from: accounts[0]});


        // get orders
        const orders = await modelOneInstance.getOrders.call();
        const sellOrder = await modelOneInstance.orders.call(orders[0]);
        assert.equal(sellOrder[2], sharesToSell, "Sell order shares are incorrect");
        assert.equal(sellOrder[1], price, "Sell order price is incorrect");

        // check that owner can't purchase it own shares
        try {
            await modelOneInstance.accept(accounts[0], sharesToSell - sharesBought, {from: accounts[0], value: 10000000});
        }
        catch (e) {
            assert.equal(e.reason, "Can't accept your own order", "Purchase is not disabled");
        }



        // account 2 allowenace - to be able to pay
        await erc20Token.approve(modelOneInstance.address, Math.floor(price * (sharesBought) * 1.1).toString(), { from: accounts[2] })
        // check allowance
        const allowance = await erc20Token.allowance.call(accounts[2], modelOneInstance.address);
        assert.equal(allowance, Math.floor(price * (sharesBought) * 1.1), "Allowance is not correct");

        // account 2 accepts the order
        await modelOneInstance.accept(orders[0], sharesBought, {from: accounts[2], value: 10000000});



        // check that the owner has less shares (5% of the shares is still in the order)
        const ownerShares = await modelOneInstance.getShares.call(accounts[0]);
        assert.equal(ownerShares, totalSupply - sharesToSell, "Owner does not have all shares");


        // check that the buyer has more shares
        const buyerShares = await modelOneInstance.getShares.call(accounts[2]);
        assert.equal(buyerShares, sharesBought, "Buyer does not have all shares");


        // check accounts balances before withdraw and payments
        const ownerBalanceBefore = (await erc20Token.balanceOf.call(accounts[0])).toNumber();

        // make more payments
        // make two new payments
        const payment1 = 100000000; // payment amount
        const payment2 = 250000000; // payment amount
        const prev_payment = 250000000;
        
        await erc20Token.approve(modelOneInstance.address, payment1.toString(), { from: accounts[8] })
        await modelOneInstance.pay(payment1, {from: accounts[8], value: 10000000});
        await erc20Token.approve(modelOneInstance.address, payment2.toString(), { from: accounts[8] })
        await modelOneInstance.pay(payment2, {from: accounts[8], value: 10000000});

        // get sell order after selling
        const sellOrderAfter = await modelOneInstance.orders.call(orders[0]);

        const owner_cut = payment1 * 0.1 + payment2 * 0.1; 
        
        // check that the owner got payed
        const ownerBalanceAfter = (await erc20Token.balanceOf.call(accounts[0])).toNumber();
        assert.equal(ownerBalanceAfter, ownerBalanceBefore + owner_cut, "Owner did not get payed");


        // contract balance before withdraw
        const contractBalanceBefore = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();

        // withdraw with account 0 and account 2
        await modelOneInstance.withdraw({from: accounts[0]});

        // contract balance after first withdraw
        const contractBalanceAfter = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalanceAfter, contractBalanceBefore - prev_payment * 0.9 * 0.85, "Contract has incorrect balance");

        await modelOneInstance.withdraw({from: accounts[2]});

        // contract balance after second withdraw
        const contractBalanceAfter2 = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalanceAfter2, contractBalanceAfter - prev_payment * 0.9 * 0.15, "Contract has incorrect balance");


        const ownerTotalShares = ownerShares.toNumber() + sellOrderAfter[2].toNumber();
        const ownerTotalShare = ownerTotalShares/totalSupply;
        const balancePrediction = ownerBalanceAfter + (prev_payment * 0.9 * ownerTotalShare);
 
        // check that the owner got payed
        const ownerBalanceAfterWithdraw = (await erc20Token.balanceOf.call(accounts[0])).toNumber();
        assert.equal(ownerBalanceAfterWithdraw, balancePrediction, "Owner did not get payed");
        
        // check that buyer balance before withdraw
        const buyerBalanceBefore = (await erc20Token.balanceOf.call(accounts[2])).toNumber();

        await modelOneInstance.disburse({from: accounts[0]});
        await modelOneInstance.withdraw({from: accounts[0]});
        await modelOneInstance.withdraw({from: accounts[2]});
                
        // check that buyer got payed
        const buyerBalanceAfter = (await erc20Token.balanceOf.call(accounts[2])).toNumber();
        assert.equal(buyerBalanceAfter, buyerBalanceBefore + contractBalanceAfter2 * 0.15, "Buyer did not get payed");
        
        // check that contract balance is 0
        const contractBalanceAfterWithdraw = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalanceAfterWithdraw, 0, "Contract has incorrect balance");

    });

    // Check how much more shares owner can sell
    it("Check how much more shares owner can sell", async () => {
        // get active orders
        const _orders = await modelOneInstance.getOrders.call();
        assert.equal(_orders.length, 1, "There are orders");

        // get owner order -> should be the only one
        const _order = await modelOneInstance.orders.call(_orders[0]);
        assert.equal(_orders[0], accounts[0], "Order owner is incorrect");
        assert.equal(_order[2], 5 * Math.pow(10, decimals), "Order shares are incorrect"); 

        const price = 100000;

        // try selling more that 85 shares
        try {
             await modelOneInstance.sell(price, 20, {from: accounts[0]});
        }
        catch (e) {
            assert.equal(e.reason, "Active order, cancel first", "Owner can sell more than 85% of shares");
        }

        // try to cancel unexisting order with account 2
        try {
            await modelOneInstance.cancel({from: accounts[2]});
        }
        catch (e) {
            assert.equal(e.reason, "Invalid order", "Account 2 can cancel order");
        }

        // check that owner has only 80% of shares are available
        const ownerSharesBefore = await modelOneInstance.getShares.call(accounts[0]);
        assert.equal(ownerSharesBefore, totalSupply * 0.8, "Owner does not have 80% of shares");
        
        // cancel previus sell order
        await modelOneInstance.cancel({from: accounts[0]});

        // check that there is no orders
        const orders = await modelOneInstance.getOrders.call();
        assert.equal(orders.length, 0, "There are orders");

        // check that owner has 85% of shares
        const ownerShares = (await modelOneInstance.getShares.call(accounts[0])).toNumber();
        assert.equal(ownerShares, totalSupply * 0.85, "Owner does not have 85% of shares");
        

        // try selling more that 85% of shares
        try {
            const sharesToSell = totalSupply * 0.85 + 1;
            await modelOneInstance.sell(price, sharesToSell, {from: accounts[0]});
        }
        catch (e) {
            assert.equal(e.reason, "Invalid amount submitted", "Owner can sell more than 85% of shares");
        }

        // there should be no orders as the owner can't sell more than 85% of shares
        const orders2 = await modelOneInstance.getOrders.call();
        assert.equal(orders2.length, 0, "There are orders");
        
        // check owner shares
        const ownerShares2 = await modelOneInstance.getShares.call(accounts[0]);
        assert.equal(ownerShares2, totalSupply * 0.85, "Owner does not have 85% of shares");

    });

    it("Make sell and buy orders", async () => {
        const price = 100000;
        const sharesToSell = 10 * Math.pow(10, decimals);
        const sharesToBuy = 5 * Math.pow(10, decimals);

        // make sell order
        await modelOneInstance.sell(price, sharesToSell, {from: accounts[0]});

        // check that there is one order
        const orders = await modelOneInstance.getOrders.call();
        assert.equal(orders.length, 1, "There are orders");

        // get order
        const order = await modelOneInstance.orders.call(orders[0]);
        assert.equal(order[1], price, "Order price is incorrect");
        assert.equal(order[2], sharesToSell, "Order shares are incorrect");

        // make buy order
        // allowenace for account 2 to be able to pay
        await erc20Token.approve(modelOneInstance.address, Math.floor(price * (sharesToBuy) * 1.1).toString(), { from: accounts[3] })
        // check allowance
        const allowance = await erc20Token.allowance.call(accounts[3], modelOneInstance.address);
        assert.equal(allowance, Math.floor(price * (sharesToBuy) * 1.1), "Allowance is not correct");

        // check balance before buy order
        const contractBalanceBefore = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();

        // account 3 makes buy order
        await modelOneInstance.buy(price, sharesToBuy, {from: accounts[3], value: 10000000});


        const tax = price * sharesToBuy * 0.1;

        // check balance of the contract after buy order
        const contractBalance = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalance, contractBalanceBefore + price * sharesToBuy + tax, "Contract has incorrect balance");
        

        // check that there is no orders
        const orders2 = await modelOneInstance.getOrders.call();
        assert.equal(orders2.length, 2, "There are orders");

        // check that owner has less shares
        const ownerShares = await modelOneInstance.getShares.call(accounts[0]);
        assert.equal(ownerShares, totalSupply * 0.85 - sharesToSell, "Owner does not have shares that should be left");
    });

    // accept partialy sell and buy orders
    it("Accept partialy sell and buy orders", async () => {

        const orders = await modelOneInstance.getOrders.call();
        assert.equal(orders.length, 2, "There are orders");

        const prevSellShares = 10 * Math.pow(10, decimals);
        const prevBuyShares = 5 * Math.pow(10, decimals);


        const acceptSellShares = prevSellShares / 2;
        const acceptSellSharesPrice = acceptSellShares * 100000
        const acceptSellSharesFee = acceptSellSharesPrice * 0.1;

        const acceptBuyShares = prevBuyShares - 3 * Math.pow(10, decimals)
        const acceptBuySharesPrice = acceptBuyShares  * 100000
        const acceptBuySharesFee = acceptBuySharesPrice * 0.1;


        // check sell order shares before accepting
        const sellOrder = await modelOneInstance.orders.call(orders[0]);
        assert.equal(sellOrder[2], prevSellShares, "Sell order shares are incorrect");



        // check owner share before accepting both orders
        const ownerShares = await modelOneInstance.getShares.call(accounts[0])
        // check balance of account 0 before accepting buy order
        const ownerBalance = (await erc20Token.balanceOf.call(accounts[0])).toNumber();


        // allowenace for account 3 to be able to pay
        await erc20Token.approve(modelOneInstance.address, Math.floor(acceptSellSharesPrice * 1.1).toString(), { from: accounts[3] })

        // accept sell order
        await modelOneInstance.accept(orders[0], acceptSellShares, {from: accounts[3], value: 10000000});
        
        // check number of shares that are left in the order 
        const order = await modelOneInstance.orders.call(orders[0]);
        assert.equal(order[2], acceptSellShares, "Order shares are incorrect");

        // check account 3 shares after accepting sell order
        const buyerSharesAfterSell = await modelOneInstance.getShares.call(accounts[3]);
        assert.equal(buyerSharesAfterSell, acceptSellShares, "Buyer does not have shares that should be left");
        

        // check balance of the contract before accepting buy order
        const contractBalance = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        

        // try accepting buy order with account 4 - account 4 doesnt have any shares
        try {
            await modelOneInstance.accept(orders[1], acceptBuyShares, {from: accounts[4], value: 10000000});
        } catch(e) {
            assert.equal(e.reason, "Insufficient shares", "Owner does not have shares that should be left");
        }


        // account 0 accept buy order
        await modelOneInstance.accept(orders[1], acceptBuyShares, {from: accounts[0], value: 10000000});

        // check number of shares that are left in the order
        const order2 = await modelOneInstance.orders.call(orders[1]);
        assert.equal(order2[2], prevBuyShares - acceptBuyShares, "Order shares are incorrect");


        // check balance of the contract after accepting buy order
        const contractBalanceAfter = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalanceAfter, contractBalance - acceptBuySharesPrice - acceptBuySharesFee, "Contract has incorrect balance");

        // check balance of account 0 after accepting buy order - should get acceptBuySharesPrice + acceptBuySharesFee
        const ownerBalanceAfter = (await erc20Token.balanceOf.call(accounts[0])).toNumber();
        assert.equal(ownerBalanceAfter, ownerBalance + acceptBuySharesPrice + acceptBuySharesFee + acceptSellSharesPrice + acceptSellSharesFee, "Owner has incorrect balance");


        // check number of shares - account 3
        const buyerShares = await modelOneInstance.getShares.call(accounts[3]);
        assert.equal(buyerShares.toNumber(), buyerSharesAfterSell.toNumber() + acceptBuyShares, "Buyer has incorrect number of shares");


        // try accepting more that there is in the buy order
        try {
            await modelOneInstance.accept(orders[1], acceptBuyShares + 3 * Math.pow(10, decimals), {from: accounts[0], value: 10000000});
        }
        catch (e) {
            assert.equal(e.reason, 'Invalid order', "There was more shares accepted than there is in the order");
        }


        // try accepting rest of the shares in the buy order with account 3
        try {
            await modelOneInstance.accept(orders[1], prevBuyShares - acceptBuyShares, {from: accounts[3], value: 10000000});
        }
        catch (e) {
            assert.equal(e.reason, "Can't accept your own order", "You can accept your own buy order");
        }

        // accept rest of the shares in the buy order with account 0
        await modelOneInstance.accept(orders[1], prevBuyShares - acceptBuyShares, {from: accounts[0], value: 10000000});

        // check that there is only one order left
        const orders2 = await modelOneInstance.getOrders.call();
        assert.equal(orders2.length, 1, "There are orders");

        // check sheares of account 3
        const buyerShares2 = await modelOneInstance.getShares.call(accounts[3]);
        assert.equal(buyerShares2.toNumber(), buyerShares.toNumber() + prevBuyShares - acceptBuyShares, "Buyer has incorrect number of shares");

        // check owner shares
        const ownerShares2 = await modelOneInstance.getShares.call(accounts[0]);
        assert.equal(ownerShares2.toNumber(), ownerShares.toNumber() - acceptSellShares, "Owner has incorrect number of shares");

        // check that balance of the contract is 0
        const contractBalanceAfter2 = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalanceAfter2, 0, "Contract has incorrect balance");

    });

    
    // Check if escrow is returned to the buyer if he cancels the partialy filled order
    it("Check if escrow is returned to the buyer if he cancels the partialy filled order", async () => {
        // make a new buy order with account 4
        const price = 100000;
        const sharesToBuy = 20 * Math.pow(10, decimals);

        // allowenace for account 4 to be able to pay
        await erc20Token.approve(modelOneInstance.address, Math.floor(price * (sharesToBuy) * 1.1).toString(), { from: accounts[4] })

        // account 4 makes buy order
        await modelOneInstance.buy(price, sharesToBuy, {from: accounts[4], value: 10000000});

        // get orders
        const orders = await modelOneInstance.getOrders.call();
        assert.equal(orders.length, 2, "There are orders");

        // check order escrow before accepting sell order
        const order = await modelOneInstance.orders.call(orders[1]);
        assert.equal(order[3], price * sharesToBuy + price * sharesToBuy * 0.1, "Order escrow is incorrect");

        // check account 3 balance before accepting sell order
        const buyerBalanceBefore = (await erc20Token.balanceOf.call(accounts[3])).toNumber();

        // check account 3 shares before accepting sell order
        const buyerSharesBefore = (await modelOneInstance.getShares.call(accounts[3])).toNumber();

        // account 3 accept buy order
        await modelOneInstance.accept(orders[1], sharesToBuy - buyerSharesBefore, {from: accounts[3], value: 10000000});

        // check order escrow after accepting sell order
        const orderAfter = await modelOneInstance.orders.call(orders[1]);
        assert.equal(orderAfter[3], price * (sharesToBuy - buyerSharesBefore) + price * (sharesToBuy - buyerSharesBefore) * 0.1, "Order escrow is incorrect"); // 10% fee

        // check account 3 balance after accepting sell order
        const buyerBalanceAfter = (await erc20Token.balanceOf.call(accounts[3])).toNumber();
        assert.equal(buyerBalanceAfter, buyerBalanceBefore + price * (sharesToBuy - buyerSharesBefore), "Buyer has incorrect balance");

        // check that account 3 does not have shares
        const buyerShares = await modelOneInstance.getShares.call(accounts[3]);
        assert.equal(buyerShares.toNumber(), 0, "Buyer has incorrect number of shares");


        // make a new payment
        const payment = 250000000; // payment amount

        // allowenace for account 8 to be able to pay
        await erc20Token.approve(modelOneInstance.address, payment, { from: accounts[8] })
        const allowance = await erc20Token.allowance.call(accounts[8], modelOneInstance.address);
        assert.equal(allowance, payment, "Allowance is not correct");


        // make a new payment
        await modelOneInstance.pay(payment, {from: accounts[8], value: 10000000});


        // disburse
        await modelOneInstance.disburse({from: accounts[4]});

        
        // check contract balance before canceling buy order
        const contractBalanceBefore = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();

        // check account 4 balance before canceling buy order
        const buyerBalanceBeforeCancel = (await erc20Token.balanceOf.call(accounts[4])).toNumber();


        // check there are two orders
        const ordersBefore = await modelOneInstance.getOrders.call();
        assert.equal(ordersBefore.length, 2, "There are orders");;

        // cancel buy order
        await modelOneInstance.cancel({from: accounts[4]});

        // check there only one order left
        const ordersAfter = await modelOneInstance.getOrders.call();
        assert.equal(ordersAfter.length, 1, "There are orders");

        // check contract balance after canceling buy order
        const contractBalanceAfter = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalanceAfter, payment * 0.9, "Contract has incorrect balance");

        // check account 4 balance after canceling buy order
        const buyerBalanceAfterCancel = (await erc20Token.balanceOf.call(accounts[4])).toNumber();
        assert.equal(buyerBalanceAfterCancel, buyerBalanceBeforeCancel + contractBalanceBefore - payment * 0.9, "Buyer has incorrect balance");


    });

    // Check if buyer 1 can withdraw if he bought shares after the latest disburse
    it("Check if buyer 1 can withdraw if he bought shares after the latest disburse", async () => {

        // get orders
        const orders = await modelOneInstance.getOrders.call();
        assert.equal(orders.length, 1, "Orders are incorrect");

        // get order price
        const order = await modelOneInstance.orders.call(orders[0]);
        const price = order[1].toNumber();
        const sharesToBuy = order[2].toNumber();


        // make a new payment
        const payment = 250000000; // payment amount

        // allowenace for account 8 to be able to pay
        await erc20Token.approve(modelOneInstance.address, payment, { from: accounts[8] })
        const allowance = await erc20Token.allowance.call(accounts[8], modelOneInstance.address);
        assert.equal(allowance, payment, "Allowance is not correct");

        // make a new payment
        await modelOneInstance.pay(payment, {from: accounts[8], value: 10000000});

        // disburse
        await modelOneInstance.disburse({from: accounts[4]});


        // allowence for account 3 to be able to pay
        await erc20Token.approve(modelOneInstance.address, Math.floor(price * sharesToBuy * 1.1).toString(), { from: accounts[3] })

        // accept order
        await modelOneInstance.accept(orders[0], sharesToBuy, {from: accounts[3], value: 10000000});

        // check that there is no orders
        const orders2 = await modelOneInstance.getOrders.call();
        assert.equal(orders2.length, 0, "There are orders");

        // check that account 3 has shares
        const buyerShares = await modelOneInstance.getShares.call(accounts[3]);
        assert.equal(buyerShares.toNumber(), order[2], "Buyer has incorrect number of shares");

        // get shareholders
        const shareholders = await modelOneInstance.getShareholders.call();

        // contract balance before withdraw
        const contractBalanceBefore = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();

        // withdraw with every shareholder
        for(let shareholder of shareholders) {
            await modelOneInstance.withdraw({from: shareholder});
        }

        // check contract balance after withdraw
        const contractBalanceAfter = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalanceAfter, contractBalanceBefore / 2, "Contract has incorrect balance");

    });

    // try swapping shares of not the same disburse level
    it("Try swapping shares of not the same disburse level", async () => {
        // make a new buy order with account 4
        const price = 100000;
        const sharesToBuy = 20 * Math.pow(10, decimals);



        // check balance of contract - should be 0.9 * last payment
        const contractBalanceBefore = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalanceBefore, 0.9 * 250000000, "Contract has incorrect balance");


        // check account 4 balance before buying shares
        const buyerBalanceBefore = (await erc20Token.balanceOf.call(accounts[4])).toNumber();

        // allowenace for account 4 to be able to pay
        await erc20Token.approve(modelOneInstance.address, Math.floor(price * (sharesToBuy) * 1.1).toString(), { from: accounts[4] })
        // account 4 makes buy order
        await modelOneInstance.buy(price, sharesToBuy, {from: accounts[4], value: 10000000});

        // check account 4 balance after buying shares
        const buyerBalanceAfter = (await erc20Token.balanceOf.call(accounts[4])).toNumber();
        assert.equal(buyerBalanceAfter, buyerBalanceBefore - price * sharesToBuy * 1.1, "Buyer has incorrect balance");

        // account 0 makes a withdraw
        await modelOneInstance.withdraw({from: accounts[0]});


        // check contract balance before withdraw
        const contractBalanceAfterWithdraw = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();

        // account 0 tries to accept buy order
        try {
            await modelOneInstance.accept(accounts[4], sharesToBuy, {from: accounts[0], value: 10000000});
        }
        catch (e) {
            assert.equal(e.reason, "Can't swap shares of uneven levels", "Account 0 can accept buy order");
        }

        // account 4 cancles buy order
        await modelOneInstance.cancel({from: accounts[4]});

        // check account 4 balance after canceling buy order
        const buyerBalanceAfterCancel = (await erc20Token.balanceOf.call(accounts[4])).toNumber();
        assert.equal(buyerBalanceAfterCancel, buyerBalanceAfter + price * sharesToBuy * 1.1, "Buyer has incorrect balance");

        // check that there is no orders
        const orders = await modelOneInstance.getOrders.call();
        assert.equal(orders.length, 0, "There are orders");

        // check contract balance after canceling buy order
        const contractBalanceAfterCancel = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalanceAfterCancel, contractBalanceAfterWithdraw - price * sharesToBuy * 1.1, "Contract has incorrect balance");
        



        // account 4 sells shares
        const sharesToSell = 10 * Math.pow(10, decimals);
        await modelOneInstance.sell(price, sharesToSell, {from: accounts[4]});

        // check balance of contract - should be 0.9 * last payment
        const contractBalance = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalance, 0.9 * 250000000 * 0.3, "Contract has incorrect balance");

        
        
        // account 5 accepts sell order
        // allowance for account 5 to be able to pay
        await erc20Token.approve(modelOneInstance.address, Math.floor(price * (sharesToSell) * 1.1).toString(), { from: accounts[5] })
        await modelOneInstance.accept(accounts[4], sharesToSell, {from: accounts[5], value: 10000000});

        // check that account 4 does not have shares
        const account4Shares1 = await modelOneInstance.getShares.call(accounts[4]);
        assert.equal(account4Shares1.toNumber(), 0, "Account 4 has incorrect number of shares");


        // account 0 makes a sell order
        const sharesToSell2 = 5 * Math.pow(10, decimals);
        await modelOneInstance.sell(price, sharesToSell2, {from: accounts[0]});

        // account 4 accepts sell order
        // allowance for account 4 to be able to pay
        await erc20Token.approve(modelOneInstance.address, Math.floor(price * (sharesToSell2) * 1.1).toString(), { from: accounts[4] })
        await modelOneInstance.accept(accounts[0], sharesToSell2, {from: accounts[4], value: 10000000});

        // check that account 4 has shares
        const account4Shares = await modelOneInstance.getShares.call(accounts[4]);
        assert.equal(account4Shares.toNumber(), sharesToSell2, "Account 4 has incorrect number of shares");


        // check that there is no orders
        const orders2 = await modelOneInstance.getOrders.call();
        assert.equal(orders2.length, 0, "There are orders");


        
        const shareholders = await modelOneInstance.getShareholders.call();
        // withdraw with every shareholder
        for(let shareholder of shareholders) {
            try {
                await modelOneInstance.withdraw({from: shareholder});
            } catch(e) {
                assert.equal(e.reason, "Nothing to disburse", "Account 0 can withdraw");
            }
        }

        // check contract balance after withdraw
        const contractBalanceAfter = (await erc20Token.balanceOf.call(modelOneInstance.address)).toNumber();
        assert.equal(contractBalanceAfter, 0, "Contract has incorrect balance");

    });

    // TODO: Check if DeVest is getting fees
});
