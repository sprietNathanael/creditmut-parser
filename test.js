#!/usr/bin/env node

'use strict';

const http = require('http');
const https = require('https');
const formurlencoded = require('form-urlencoded');
// const sslkeylog = require('sslkeylog');
const zlib = require('zlib');
const fastXmlParser = require('fast-xml-parser');
const fs = require('fs');

const { pipeline } = require('stream');
const keepAliveAgent = new https.Agent({ keepAlive: true });

// sslkeylog.hookAll();

const siteHost = 'www.creditmutuel.fr';

const cookiesToIgnore = ['SessionTimeout', 'SessionStart'];

const defaultOptions = {
	rejectUnauthorized: false,
	requestCert: false,
	agent: keepAliveAgent,
	encoding: null,
};

const headers = {
	'Accept-Encoding': 'gzip, deflate',
	'User-Agent': 'Wget/1.11.4',
	Accept: '*/*',
};

let rawdata = fs.readFileSync('authDetails.json');
let authDetails = JSON.parse(rawdata);

const login = authDetails.login;
const password = authDetails.password;

function updateAuthDetailsFile(authDetails) {
	fs.writeFileSync('authDetails.json', JSON.stringify(authDetails));
}

function getRequest(host, path, cookies = {}, referer, port = 443) {
	let cookiesArray = [];
	for (let cookie in cookies) {
		cookiesArray.push(`${cookie}=${cookies[cookie]}`);
	}
	let httpsOptions = {
		...defaultOptions,
		host: host,
		path: path,
		port: port,
		method: 'GET',
		headers: {
			...headers,
			Cookie: cookiesArray,
		},
	};
	if (referer) {
		httpsOptions.headers['Referer'] = referer;
	}
	return processRequest(httpsOptions);
}

function postFormRequest(host, path, body, cookies = {}, referer, port = 443) {
	let cookiesArray = [];
	for (let cookie in cookies) {
		cookiesArray.push(`${cookie}=${cookies[cookie]}`);
	}
	let bodyToSend = formurlencoded(body);
	let length = bodyToSend.length;
	let httpsOptions = {
		...defaultOptions,
		host: host,
		path: path,
		port: port,
		method: 'POST',
		headers: {
			...headers,
			'Content-Type': 'application/x-www-form-urlencoded',
			Cookie: cookiesArray,
			'Content-Length': length,
		},
	};
	if (referer) {
		httpsOptions.headers['Referer'] = referer;
	}
	return processRequest(httpsOptions, bodyToSend);
}

function processRequest(options, body = undefined) {
	return new Promise(async (resolve) => {
		let retry = true;
		while (retry) {
			try {
				let res = await new Promise((resolve, reject) => {
					// let data = '';
					let data = [];
					let headers = {};
					let requestCallback = (response) => {
						response.on('data', (dataReceived) => {
							// data += dataReceived;
							data.push(dataReceived);
						});
						response.on('end', () => {
							let buffer = Buffer.concat(data);
							if (headers['content-encoding'] == 'gzip') {
								zlib.gunzip(buffer, (err, dezipped) => {
									if (dezipped) {
										resolve({ data: dezipped.toString(), headers });
									} else {
										resolve({ buffer, headers });
									}
								});
							} else {
								resolve({ buffer, headers });
							}
							// resolve({ data, headers });
						});
						response.on('error', (err) => {
							console.error(err);
						});
					};

					let request = https.request(options, requestCallback);
					request.on('response', (res) => {
						console.log(
							`<=== ${res.statusCode} on ${options.method} ${options.host}:${options.port}${options.path}`
						);
						headers = res.headers;
					});
					request.on('error', (e) => {
						console.log(e);
						reject();
					});

					console.log(`===> ${options.method} ${options.host}:${options.port}${options.path}`);

					if (body !== undefined) {
						// request.write(JSON.stringify(body));
						request.write(body);
					}

					request.end();
				});
				retry = false;
				resolve(res);
			} catch (error) {
				retry = true;
			}
		}
	});
}

function parseCookies(response, existingCookies = {}) {
	let cookiesPresent = Object.keys(response.headers).find((header) => header.match(/set-cookie/i));
	if (cookiesPresent) {
		let headerCookies = response.headers[cookiesPresent];
		for (let cookie of headerCookies) {
			let cookieSplited = cookie.split(';')[0].split('=');
			if (!cookiesToIgnore.includes(cookieSplited[0])) {
				existingCookies[cookieSplited[0]] = cookieSplited[1];
			}
		}
	}
	return existingCookies;
}

function tryToken(transactionId, cookies) {
	return new Promise(async (resolve, reject) => {
		let accepted = false;
		// while (!accepted) {
		let res = await postFormRequest(
			siteHost,
			'/fr/banque/async/otp/SOSD_OTP_GetTransactionState.htm',
			{
				transactionId: transactionId,
			},
			cookies
		);
		console.log(res.data);
		let resObj = fastXmlParser.parse(res.data);
		console.log(resObj);
		if (resObj.root.transactionState === 'PENDING') {
			accepted = false;
			setTimeout(() => {
				resolve(accepted);
			}, 2000);
		} else {
			accepted = true;
			resolve(accepted);
		}
	});
}

function authenticateWithoutToken() {
	let cookies = {};

	let transactionId = '';
	let otp_hidden = '';
	let antiForgeryToken = '';
	return postFormRequest(
		siteHost,
		'/fr/authentification.html',
		{
			_cm_user: login,
			flag: 'password',
			_charset_: '',
			_cm_pwd: password,
		},
		cookies
	)
		.then((res) => {
			cookies = parseCookies(res, cookies);
			delete cookies.initially_requested_url;
			console.log(cookies);
			return getRequest(siteHost, '/fr/banque/validation.aspx', cookies);
		})
		.then((res) => {
			cookies = parseCookies(res, cookies);
			console.log(cookies);
			let dataResponse = res.data.toString('utf8');
			transactionId = dataResponse.match(/transactionId: \'((\d|[a-z])*)\',/)[1];
			otp_hidden = dataResponse.match(/\<input type=\"\w*\" name=\"otp_hidden\" value="((\d|\w|;)*)\"/)[1];
			antiForgeryToken = dataResponse.match(/\;k___ValidateAntiForgeryToken=((\w|-)*)\"/)[1];
			return new Promise(async (resolve, reject) => {
				let accepted = false;
				while (!accepted) {
					accepted = await tryToken(transactionId, cookies);
				}
				resolve();
			});
		})
		.then((res) => {
			// cookies = parseCookies(res, cookies);
			console.log(cookies);
			return postFormRequest(
				'www.creditmutuel.fr',
				`/fr/banque/validation.aspx?_tabi=C&_pid=OtpValidationPage&k___ValidateAntiForgeryToken=${antiForgeryToken}`,
				{
					otp_hidden: otp_hidden,
					global_backup_hidden_key: '',
					_FID_DoValidate: '',
					_wxf2_cc: 'fr-FR',
				},
				cookies
			);
		})
		.then((res) => {
			cookies = parseCookies(res, cookies);
			console.log(cookies);
			updateAuthDetailsFile({ ...authDetails, auth_client_state: cookies.auth_client_state });
			return cookies;
			// return getRequest(siteHost, '/fr/banque/pageaccueil.html', cookies);
		});
}

function authenticateWithToken(auth_client_state) {
	let cookies = {
		auth_client_state: auth_client_state,
	};

	return postFormRequest(
		siteHost,
		'/fr/authentification.html',
		{
			_cm_user: login,
			flag: 'password',
			_charset_: '',
			_cm_pwd: password,
		},
		cookies
	).then((res) => {
		cookies = parseCookies(res, cookies);
		delete cookies.initially_requested_url;
		return cookies;
	});
}

let cookies = {};
let authFunction = authenticateWithoutToken;
if (authDetails.auth_client_state) {
	console.log('????1');
	authFunction = authenticateWithToken;
}
console.log(authFunction);

authFunction(authDetails.auth_client_state)
	.then((cookies) => {
		console.log('==================');
		console.log(cookies);
		return getRequest(siteHost, '/fr/banque/pageaccueil.html', cookies);
	})
	.then((res) => {
		console.log(res);
	});
