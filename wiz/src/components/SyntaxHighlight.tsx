import * as React from 'react';
import {Text} from 'ink';
import {highlight, Theme} from 'cli-highlight';

export interface Props {
	code: string;
	language?: string;
	theme?: Theme;
}
/**
 * SyntaxHighlight.
 */
const SyntaxHighlight = ({ code, language, theme } : Props) => {
	const highlightedCode = React.useMemo(() => {
		return highlight(code, {language, theme});
	}, [code, language, theme]);

	return <Text>{highlightedCode}</Text>;
};

export default SyntaxHighlight;