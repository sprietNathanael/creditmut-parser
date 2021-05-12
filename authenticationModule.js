const httpRequestModule = require('./httpRequestModule');
const fastXmlParser = require('fast-xml-parser');

const siteHost = 'www.creditmutuel.fr';

class AuthenticationModule {
	constructor(authData, cliModule) {
		this.tokens = authData.accountTokens;
		this.cliModule = cliModule;
	}

	getToken(id, password) {
		this.cliModule.changeSpinner('Retrieve token');
		return new Promise(async (resolve, reject) => {
			let existingToken = this?.tokens.find((el) => el.id === id);
			if (existingToken) {
				this.cliModule.successSpinner();
				resolve(existingToken);
			} else {
				let cookies = {};
				let transactionId = '';
				let otp_hidden = '';
				let antiForgeryToken = '';

				let response = await httpRequestModule.postFormRequest(siteHost, '/fr/authentification.html', {
					_cm_user: id,
					flag: 'password',
					_charset_: '',
					_cm_pwd: password,
				});
				cookies = response.cookies;
				delete cookies.initially_requested_url;
				console.log(response.statusCode);
				console.log(cookies);
				response = await httpRequestModule.getRequest(siteHost, '/fr/banque/validation.aspx', cookies);
				cookies = response.cookies;
				let dataResponse = response.data.toString('utf8');
				transactionId = dataResponse.match(/transactionId: \'((\d|[a-z])*)\',/)[1];
				otp_hidden = dataResponse.match(/\<input type=\"\w*\" name=\"otp_hidden\" value="((\d|\w|;)*)\"/)[1];
				antiForgeryToken = dataResponse.match(/\;k___ValidateAntiForgeryToken=((\w|-)*)\"/)[1];
				this.cliModule.waitNextInstruction('Waithing for 2FA validation');
				console.log(cookies);
				cookies = await this.waitForToken(transactionId, cookies);
				this.cliModule.success();
				this.cliModule.changeSpinner('Retrieve token');
				response = await httpRequestModule.postFormRequest(
					siteHost,
					`/fr/banque/validation.aspx?_tabi=C&_pid=OtpValidationPage&k___ValidateAntiForgeryToken=${antiForgeryToken}`,
					{
						otp_hidden: otp_hidden,
						global_backup_hidden_key: '',
						_FID_DoValidate: '',
						_wxf2_cc: 'fr-FR',
					},
					cookies
				);

				console.log(response.cookies);
			}
		});
	}

	waitForToken(transactionId, cookies) {
		return new Promise(async (resolve, reject) => {
			let accepted = false;
			let newCookies = [];
			while (!accepted) {
				console.log(cookies);
				let res = await httpRequestModule.postFormRequest(
					siteHost,
					'/fr/banque/async/otp/SOSD_OTP_GetTransactionState.htm',
					{
						transactionId: transactionId,
					},
					cookies
				);
				let resObj = fastXmlParser.parse(res.data);
				newCookies = res.cookies;
				console.log(resObj);
				if (resObj.root.transactionState === 'PENDING') {
					accepted = false;
				} else {
					accepted = true;
				}

				await new Promise((resolve, reject) => {
					setTimeout(() => {
						resolve();
					}, 2000);
				});
			}
			resolve(newCookies);
		});
	}
}

module.exports = AuthenticationModule;
