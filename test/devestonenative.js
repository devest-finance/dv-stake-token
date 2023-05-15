var devestDAOAddress = null;
var exampleModelAddress = null;

/*
contract('DevestOneNative', (accounts) => {

    it('should put 1000000 Token in the first account', async () => {
        const ERC20TokenInstance = await ERC20.deployed();
        const balance = await ERC20TokenInstance.balanceOf.call(accounts[0]);

        const balanceAccount = await web3.eth.getBalance(accounts[0]);

        assert.isTrue(balance.valueOf() > 0, "To less token");
        assert.isTrue(Number(balanceAccount) > 0)
    });

    it('should transfer some ETH Token to all traders', async () => {
        const erc20Token = await ERC20.deployed();

        // Setup account.
        const account = accounts[0];

        // Make transaction from first account to second.
        for (let i = 2; i < 10; i++) {
            const amount = 40000000000;
            await erc20Token.transfer(accounts[i], amount, { from: account });
        }

        // Get balances of first and second account after the transactions.
        const accountOneEndingBalance = (await erc20Token.balanceOf.call(account)).toNumber();

        // send back
        assert.equal(accountOneEndingBalance, 680000000000, "Failed to transfer funds");
    });

    it('Deploy devestONE DAO', async () => {
        const devestFactory = await DevestFactory.deployed();
        const erc20Token = await ERC20.deployed();

        const devestDAOImp = await devestFactory.issue("0x0000000000000000000000000000000000000000", "DeVest DAO", "DeVest DAO");
        devestDAOAddress = devestDAOImp.logs[0].args[1];

        await devestFactory.setRoot(devestDAOAddress, { from: accounts[0] });
        await devestFactory.setFee(100000000);

        const devestDAO = await DevestOne.at(devestDAOAddress);
        await devestDAO.initialize(1000000000, 10, true, { from: accounts[0] });
        await devestDAO.setTangible(accounts[1], { from: accounts[0] });

        const symbol = await devestDAO.symbol.call();

        assert.equal(symbol, "% DeVest DAO", "Failed to issue DeVest DAO Contract");
    });

    it('Deploy model-one for Testing further', async () => {
        const devestFactory = await DevestFactory.deployed();

        const exampleOneContract = await devestFactory.issue("0x0000000000000000000000000000000000000000", "Example", "EXP", { value: 100000000 });
        exampleModelAddress = exampleOneContract.logs[0].args[1];

        const devestDAO = await DevestOne.at(exampleModelAddress);
        const symbol = await devestDAO.symbol.call();

        assert.equal(symbol, "% EXP", "Failed to issue Example Contract");
    });

    it('should Setup Tangible', async () => {
        const devestOne = await DevestOne.at(exampleModelAddress);

        // check if variables set
        const name = await devestOne.name.call();
        assert(name, "Example", "Invalid name on TST");

        await devestOne.initialize(3000000000, 10, true, { from: accounts[0] });
        await devestOne.setTangible(accounts[1], { from: accounts[0] });

        const pricePerUnit = (await devestOne.price.call()).toNumber();
        assert.equal(pricePerUnit, 3000000000 / 100, "Invalid price on initialized tangible");
    })

    it('Submit Bid Orders', async () => {
        const devestOne = await DevestOne.at(exampleModelAddress);

        // submit bid
        const pricePerShare = 30000000;
        const amountOfShares = 50;
        const totalPrice = pricePerShare * amountOfShares;
        const escrow = totalPrice + ((totalPrice) * 0.1); // totalPrice + tax (10%)

        const funds = await web3.eth.getBalance(accounts[2]);
        await devestOne.bid(pricePerShare, 50, { from: accounts[2], value: escrow  });

        // tangible funds should increase
        const fundsTangible = web3.utils.toBN(await web3.eth.getBalance(devestOne.address)).toNumber();
        assert.equal(fundsTangible, escrow, "Invalid funds after bid");

        const orders = await devestOne.getOrders.call();
        assert.equal(orders.length, 1, "Order not stored");
        assert.equal(orders[0].price, pricePerShare, "Order has invalid price");
    });

    it('Accept Bid Orders (A)', async () => {
        const devestOne = await DevestOne.at(exampleModelAddress);

        // --- before
        const fundsOwnerBefore = web3.utils.toBN(await web3.eth.getBalance(accounts[0]));
        const taxReceiverBefore = web3.utils.toBN(await web3.eth.getBalance(accounts[1]));

        // fetch orders
        const orders = await devestOne.getOrders.call();
        const result = await send(devestOne.accept, [orders[0].from, 50], accounts[0], 10000000);

        // check if tax was paid
        const taxReceiver = web3.utils.toBN(await web3.eth.getBalance(accounts[1]));
        assert.equal(150000000, taxReceiver.sub(taxReceiverBefore).toNumber(), "Invalid funds on player after buy order");

        // check if owner got funds back
        // its only 14.9, because 0.1 is spend on fees ... ;)
        assert.equal(result.delta, (149000000 * 10), "Seller (owner) received invalid amount for swap");

        // no more funds on tangible ( all spend )
        const fundsTangible = await web3.eth.getBalance(devestOne.address);
        assert.equal(fundsTangible, 0, "Invalid funds on tangible after accept");

        const price = (await devestOne.price.call()).toNumber();
        assert.equal(price, 30000000, "Invalid price, in PreSale phase");

        const share = (await devestOne.getShares.call(accounts[2])).toNumber();
        assert.equal(share, 50, "Invalid share of staker");
    });

    it('Check if orders been closed', async () => {
        const devestOne = await DevestOne.at(exampleModelAddress);

        const offers = await devestOne.getOrders.call();
        assert.equal(offers.length, 0, "Buy order not closed");

        const sharedholders = await devestOne.getShareholders.call();
        assert.equal(sharedholders.length, 2, "New shareholder not included in shareholders");
    });

    it("Create ask order", async () => {
        const devestOne = await DevestOne.at(exampleModelAddress);

        await devestOne.ask(40000000, 25, { from: accounts[0] });

        const offers = await devestOne.getOrders.call();
        assert.equal(offers[0].from, accounts[0], "Invalid ask order created");
    })

    it("Accept ask order", async () => {
        const devestOne = await DevestOne.at(exampleModelAddress);

        // --- before
        const fundsOwnerBefore = web3.utils.toBN(await web3.eth.getBalance(accounts[0]));
        const fundsTaxReceiverBefore = web3.utils.toBN(await web3.eth.getBalance(accounts[1]));

        // fetch orders
        const pricePerShare = 40000000;
        const amountOfShares = 2;
        const totalPrice = pricePerShare * amountOfShares;
        let escrow = totalPrice + ((totalPrice) * 0.1); // totalPrice + tax (10%)
        escrow += 10000000;

        const orders = await devestOne.getOrders.call();
        await devestOne.accept(orders[0].from, 2, { from: accounts[3], value: escrow });

        // check if tax was paid
        const taxReceiver = web3.utils.toBN(await web3.eth.getBalance(accounts[1]));
        assert.equal(taxReceiver.sub(fundsTaxReceiverBefore).toNumber(), 8000000, "Invalid funds on player after buy order");

        // check if owner got funds back
        const fundsOwnerAfter = web3.utils.toBN(await web3.eth.getBalance(accounts[0]));
        assert.equal(fundsOwnerAfter.sub(fundsOwnerBefore), (40000000 * 2), "Seller (owner) received invalid amount for swap");

        // no more funds on tangible ( all spend )
        const fundsTangible = web3.utils.toBN(await web3.eth.getBalance(devestOne.address)).toNumber();
        assert.equal(fundsTangible, 0, "Invalid funds on tangible after accept");

        const price = (await devestOne.price.call()).toNumber();
        assert.equal(price, 40000000, "Invalid price, in PreSale phase");

        const shareOwner = (await devestOne.getShares.call(accounts[0])).toNumber();
        const share3 = (await devestOne.getShares.call(accounts[3])).toNumber();
        assert.equal(shareOwner, 48, "Invalid share of staker");
        assert.equal(share3, 2, "Invalid share of staker");
    });

    it('Add more buy orders', async () => {
        const devestOne = await DevestOne.at(exampleModelAddress);

        const price = (await devestOne.price.call()).toNumber();

        // submit bid
        await createBid(20, price, accounts[4]);
        await createBid(10, price * 1.5, accounts[5]);
        await createBid(20, price * 2, accounts[6]);
        await createBid(20, price * 0.5, accounts[7]);

        let totalEscrow = 20 * price + (10 * price * 1.5) + (20 * price * 2) + (20 * price * 0.5);
        totalEscrow += (totalEscrow * 10) / 100;

        // tangible funds should increase
        const fundsTangible = web3.utils.toBN(await web3.eth.getBalance(devestOne.address)).toNumber();
        assert.equal(fundsTangible, totalEscrow, "Invalid funds submitting buy orders");

        const orders = await devestOne.getOrders.call();
        assert.equal(orders.length, 5, "Order not stored");
        assert.equal(orders[3].price, 80000000, "Order has invalid price");
    })


    it('Accept bids', async () => {
        const devestOne = await DevestOne.at(exampleModelAddress);

        // fetch offers
        const offers = await devestOne.getOrders.call();

        // --- accept #1
        let result = await send(devestOne.accept, [offers[1].from, 20], accounts[0], 10000000);
        assert.equal(result.delta, 790000000, "Invalid amount paid to owner");

        // --- accept #2
        result = await send(devestOne.accept, [offers[2].from, 10], accounts[0], 10000000);
        assert.equal(result.delta, 590000000, "Invalid amount paid to owner");

        // --- accept #3
        result = await send(devestOne.accept, [offers[3].from, 10], accounts[0], 10000000);
        assert.equal(result.delta, 790000000, "Invalid amount paid to owner");

        // --- leftover escrow
        //   1:"40000000", "20", "880000000"
        //   2:"60000000", "10", "660000000"
        //   3:"80000000", "20", "1760000000"
        //   4:"20000000", "20", "440000000"
        //
        //   3400000000 = 40000000 * 20 + 60000000 * 10 + 80000000 * 20 + 20000000 * 20;
        //   1200000000 (Without Tax)
        //   1320000000 = 3400000000 - 800000000 - 600000000 - 800000000 -- (fees)
        fundsTangible = await getBalance(exampleModelAddress)
        assert.equal(fundsTangible.toNumber(), 1320000000, "Invalid funds on tangible after trades");

        // --- all shareholders
        const shareholders = await devestOne.getShareholders.call();
        assert.equal(shareholders[0], accounts[0], "Invalid shares");
        const sharesOnwner = 48 - 20 - 10 - 10;
        assert.equal((await devestOne.getShares.call(accounts[0])).toNumber(), sharesOnwner, "Invalid shares");

        assert.equal(shareholders[1], accounts[2], "Invalid shares");
        assert.equal((await devestOne.getShares.call(accounts[2])).toNumber(), 50, "Invalid shares");

        assert.equal(shareholders[2], accounts[3], "Invalid shares");
        assert.equal((await devestOne.getShares.call(accounts[3])).toNumber(), 2, "Invalid shares");

        assert.equal(shareholders[3], accounts[4], "Invalid shares");
        assert.equal((await devestOne.getShares.call(accounts[4])).toNumber(), 20, "Invalid shares");

        assert.equal(shareholders[4], accounts[5], "Invalid shares");
        assert.equal((await devestOne.getShares.call(accounts[5])).toNumber(), 10, "Invalid shares");

        assert.equal(shareholders[5], accounts[6], "Invalid shares");
        assert.equal((await devestOne.getShares.call(accounts[6])).toNumber(), 10, "Invalid shares");
    });

    it('Cancel offer, and get escrow back', async () => {
        const devestOne = await DevestOne.at(exampleModelAddress);

        let orders = await devestOne.getOrders.call();

        // has 10 amount left in offer
        try {
            await devestOne.cancel({from: accounts[5]});
        } catch (ex){
            assert.equal(ex.message, "Returned error: VM Exception while processing transaction: revert No open bid -- Reason given: No open bid.");
        }

        const result0 = await send(devestOne.cancel, [], accounts[0]);
        const result6 = await send(devestOne.cancel, [], accounts[6]);
        const result7 = await send(devestOne.cancel, [], accounts[7]);

        // 1200000000
        // check offers
        orders = await devestOne.getOrders.call();
        assert.equal(orders.length, 0, "Offers was not cancelled");

        let fundsTangibleAfter = await getBalance(devestOne.address);
        assert.equal(fundsTangibleAfter, 0, "Escrow not returned");

        // for account 6
        // price was 400000 * 20, 10 been soled
        const escrow6 = web3.utils.toBN(parseInt((40000000 * 2 * 10) * 1.1));
        assert.equal(result6.delta, escrow6.toNumber(), "Escrow not returned");

        // for acocunt 7
        // price was 4000000 * 0.5
        const escrow7 = web3.utils.toBN(parseInt((40000000 * 0.5 * 20) * 1.1));
        assert.equal(result7.delta, escrow7.toNumber(), "Escrow not returned");
    });


    it('Pay', async () => {
        const devestOne = await DevestOne.at(exampleModelAddress);

        // collect current funds of shareholders before dividends are paid
        const shareholders = await devestOne.getShareholders.call();
        const shareHoldersFunds = [];
        for(let shareholder of shareholders){
            shareHoldersFunds.push({
                address: shareholder,
                balance: await getBalance(shareholder),
                shares:  (await devestOne.getShares.call(shareholder)).toNumber()
            });
        }

        // disburse
        await devestOne.pay(200000000, { from: accounts[1], value: (200000000 + 10000000) });

        // TST should be empty
        const fundsTangibleAfter = await getBalance(devestOne.address);
        assert.equal(fundsTangibleAfter, 0, "Disburse failed TST Balance invalid");

        // check dividends
        const split = 200000000 - (200000000 * 0.1); // remove tax
        for(let shareholder of shareHoldersFunds){
            const after = await getBalance(shareholder.address);
            const dividends = (shareholder.shares *  split) / 100;
            const delta = after.sub(shareholder.balance).toNumber();
            assert.equal(delta, dividends, "Invalid dividends disbursed");
        }

    })

    it('Switch tangible', async () => {
        const devestOne = await DevestOne.at(exampleModelAddress);

        // call terminate until 50% reached
        await devestOne.setTangible(accounts[2], { from: accounts[0] });
        await devestOne.setTangible(accounts[2], { from: accounts[3] });
        await devestOne.setTangible(accounts[2], { from: accounts[4] });

        let address = await devestOne.tangibleAddress.call();
        assert.equal(address, accounts[1], "Contract should still have same tangible");

        await devestOne.setTangible(accounts[2], { from: accounts[2] });
        address = await devestOne.tangibleAddress.call();
        assert.equal(address, accounts[2], "Tangible after vote not updated");
    });

    it('Terminate Share', async () => {
        const devestOne = await DevestOne.at(exampleModelAddress);

        // call terminate until 50% reached
        await devestOne.terminate({ from: accounts[0] });
        await devestOne.terminate({ from: accounts[3] });
        await devestOne.terminate({ from: accounts[4] });

        let state = await devestOne.terminated.call();
        assert.equal(state, false, "Contract should not be terminated (to less votes)");

        await devestOne.terminate({ from: accounts[2] });
        state = await devestOne.terminated.call();
        assert.equal(state, true, "Contract should be terminated");
    });

    it('Check if fees been collected in DeVest DAO', async () => {
        const balance =  await web3.eth.getBalance(devestDAOAddress);
        assert.equal(balance, 160000000, "No Fees been paid to DAO");
    });

});


const send = async (fn, properties, sender, value) => {
    const fundsOwnerBefore = web3.utils.toBN(await web3.eth.getBalance(sender));

    // call function
    const recipe = await fn(...properties, { from: sender, value: value });

    // calculate costs
    const cost = web3.utils.toBN(recipe.receipt.gasUsed * recipe.receipt.effectiveGasPrice);

    // calculate delta of owner
    const fundsOwnerAfter = web3.utils.toBN(web3.utils.toBN(await web3.eth.getBalance(sender)));
    const delta = fundsOwnerAfter.sub(fundsOwnerBefore).add(cost);

    return {
        recipe: recipe,
        cost: cost.toNumber(),
        delta: delta.toNumber()
    }
}

const getBalance = async (account) => {
    return web3.utils.toBN(await web3.eth.getBalance(account));
}

const createBid = async (percent, price, address) => {
    const devestOne = await DevestOne.at(exampleModelAddress);

    // submit bid
    let escrow = price * percent;
    escrow = escrow + (escrow * 0.1)

    await devestOne.bid(price, percent, { from: address, value: escrow });
}
*/
