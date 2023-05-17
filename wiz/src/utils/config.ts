import fs from 'fs';

const CONFIG_TEMPLATE = {
	openai_key: {
		format: String,
		default: null,
		nullable: true,
	},
	openai_org: {
		format: String,
		default: null,
		nullable: true,
	},
};

const DEFAULT_CONFIG = Object.fromEntries(
	Object.entries(CONFIG_TEMPLATE).map(([key, value]) => [key, value.default]),
);

const validateConfig = config => {
	for (const [key, value] of Object.entries(config)) {
		const template = CONFIG_TEMPLATE[key];
		if (!template) {
			throw new Error(`Invalid config key: ${key}`);
		}
		if (template.format !== typeof value) {
			throw new Error(`Invalid config value for key ${key}: ${value}`);
		}
		if (!template.nullable && value === null) {
			throw new Error(`Invalid config value for key ${key}: ${value}`);
		}
	}
};

export const loadConfig = () => {
	if (!fs.existsSync('~/.wiz')) {
		return DEFAULT_CONFIG;
	}

	const config = JSON.parse(fs.readFileSync('~/.wiz', 'utf-8'));
	validateConfig(config);

	return {...DEFAULT_CONFIG, ...config};
};

export const saveConfig = config => {
	validateConfig(config);
	fs.writeFileSync('~/.wiz', JSON.stringify(config));
};
