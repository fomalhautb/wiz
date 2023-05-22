import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import { checkApiKey } from '../api/openai.js';
import { setConfig } from '../utils/config.js';
import { useRouteStore } from '../states/router.js';

const SetupPage = () => {
	const popRoute = useRouteStore(state => state.pop);

	const [apiKey, setApiKey] = useState('');
	const [status, setStatus] = useState<'entering' | 'valid' | 'invalid'>('entering');

	useInput((input, key) => {
		if (key.return) {
			checkApiKey(apiKey).then(valid => {
				if (valid) {
					setStatus('valid');
					setConfig('openai_key', apiKey);
					popRoute();
				} else {
					setStatus('invalid');
				}
			});
		} else {
			setStatus('entering');
		}
	});

	return (
		<Box>
			<Box marginRight={1}>
				<Text color="blue">Your OpenAI API key:</Text>
			</Box>
			<TextInput value={apiKey} onChange={setApiKey} />
			{status === 'invalid' ? <Text color='red'>   ❌ Invalid API key</Text> : null}
		</Box>
	);
};

export default SetupPage;