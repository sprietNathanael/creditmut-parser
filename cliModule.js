const ora = require('ora');
const table = require('cli-table3');
const prompts = require('prompts');
const chalk = require('chalk');

class CliModule {
	constructor() {
		this.spinner = ora({ isSilent: true }).stop();
	}

	askSomething() {}

	changeSpinner(message, color = '') {
		this.spinner.text = message;
		if (color) {
			this.spinner.color = color;
		}
		this.spinner.isSilent = false;
		this.spinner.start();
	}

	stopSpinner() {
		this.spinner.stopAndPersist();
	}

	askForAuthInfo() {
		console.log(chalk.cyan('Identifiers will', chalk.bold.underline('not'), 'be saved'));
		const questions = [
			{
				type: 'number',
				name: 'id',
				message: 'What is your id?',
			},
			{
				type: 'password',
				name: 'password',
				message: 'What is your password?',
			},
		];
		return prompts(questions);
		// return new Promise((resolve, reject) => {

		// })
	}

	successSpinner(message) {
		this.spinner.succeed(message);
	}

	waitNextInstruction(message) {
		this.spinner.stopAndPersist({
			symbol: '↓',
		});
		this.spinner.start(message);
	}

	success() {
		this.spinner.succeed();
	}
}

module.exports = CliModule;
