import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

type Props = {
  text: string,
};

export default function Divider({ text }: Props) {
  return (
    <Box>
      <Box borderStyle="double" borderLeft={false} borderRight={false} borderBottom={false} flexGrow={1}/>
      <Text>{' ' + text + ' '}</Text>
      <Box borderStyle="double" borderLeft={false} borderRight={false} borderBottom={false} flexGrow={1}/>
    </Box>
  );
}
