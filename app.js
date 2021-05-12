#!/usr/bin/env node

'use strict';

const fs = require('fs');
const authData = JSON.parse(fs.readFileSync('./authData.json'));

const cliModule = new (require('./cliModule'))();
const authenticationModule = new (require('./authenticationModule'))(authData, cliModule);

// cliModule.changeSpinner('Test');

// setTimeout(() => {
// 	cliModule.changeSpinner('Machin', 'red');
// }, 1000);

// setTimeout(() => {
// 	cliModule.stopSpinner();
// }, 2000);

cliModule.askForAuthInfo().then(async (res) => {
	let connexionInfo = {};
	let token = await authenticationModule.getToken(res.id, res.password);
});
