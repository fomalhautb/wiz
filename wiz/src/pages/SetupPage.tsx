import React, {useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import {setConfig} from '../utils/config.js';
import TextInput from '../components/TextInput.js';

const SetupPage = () => {
	// const [apiKey, setApiKey] = useState('');
	// const [status, setStatus] = useState<'entering' | 'valid' | 'invalid'>(
	// 	'entering',
	// );
	// const {exit} = useApp();

	// useInput((input, key) => {
	// 	if (key.return) {
	// 		checkApiKey(apiKey).then(valid => {
	// 			if (valid) {
	// 				setStatus('valid');
	// 				setConfig('openai_key', apiKey);
	// 				exit();
	// 			} else {
	// 				setStatus('invalid');
	// 			}
	// 		});
	// 	} else {
	// 		setStatus('entering');
	// 	}
	// });

	// return (
	// 	<Box>
	// 		<Box marginRight={1}>
	// 			<Text color="blue">Your OpenAI API key:</Text>
	// 		</Box>
	// 		<TextInput value={apiKey} onChange={setApiKey} />
	// 		{status === 'invalid' ? (
	// 			<Text color="red"> ❌ Invalid API key</Text>
	// 		) : null}
	// 	</Box>
	// );

	return null;
};

export default SetupPage;
