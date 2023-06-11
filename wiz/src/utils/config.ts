import fs from 'fs';
import {homedir} from 'os';
import path from 'path';

const CONFIG_TEMPLATE = {
	openai_key: {
		type: 'string',
		default: null,
		nullable: true,
	},
	openai_org: {
		type: 'string',
		default: null,
		nullable: true,
	},
};

const DEFAULT_CONFIG = Object.fromEntries(
	Object.entries(CONFIG_TEMPLATE).map(([key, value]) => [key, value.default]),
);

const CONFIG_FOLDER = path.join(homedir(), '.wiz');
const CONFIG_PATH = path.join(CONFIG_FOLDER, 'config.json')
if (!fs.existsSync(CONFIG_FOLDER)){
	fs.mkdirSync(CONFIG_FOLDER, { recursive: true });
}

const validateConfig = config => {
	for (const [key, value] of Object.entries(config)) {
		const template = CONFIG_TEMPLATE[key];
		if (!template) {
			throw new Error(`Invalid config key: ${key}`);
		}
		if ((value === null && !template.nullable) || (value !== null && template.type !== typeof value)) {
			throw new Error(`Invalid config value for key ${key}: ${value}`);
		}
	}
};

const loadConfig = () => {
	if (!fs.existsSync(CONFIG_PATH)) {
		return DEFAULT_CONFIG;
	}

	const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
	validateConfig(config);

	return {...DEFAULT_CONFIG, ...config};
};

const saveConfig = config => {
	validateConfig(config);
	fs.writeFileSync(CONFIG_PATH, JSON.stringify(config));
};

const config = loadConfig();

export const getConfig = key => {
	return config[key];
};

export const setConfig = (key, value) => {
	config[key] = value;
	validateConfig(config);
	saveConfig(config);
}
