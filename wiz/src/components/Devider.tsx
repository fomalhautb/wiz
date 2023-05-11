import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

type Props = {
  text: string,
  location?: 'left' | 'center' | 'right',
};

const Divider = ({ text, location }: Props) => {
  const line = <Box 
    borderStyle='single' 
    borderColor={'grey'} 
    borderLeft={false} 
    borderRight={false} 
    borderBottom={false} 
    flexGrow={1}
  />;

  return (
    <Box>
      {location !== 'left' ? line : null}
      <Text backgroundColor={'grey'}> {text} </Text>
      {location !== 'right' ? line : null}
    </Box>
  );
}

export default Divider;
