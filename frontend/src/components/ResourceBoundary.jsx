import { Alert, Button, Paper, Skeleton, Stack, Text } from '@mantine/core';

export function ResourceBoundary({ status, error, onRetry, children }) {
  return <>
    {error ? <Alert color="red" role="alert"><Stack gap="xs" align="flex-start">
      <Text size="sm">{error}</Text>
      {status === 'ready' ? <Text size="sm">Showing previously loaded data. Updates could not be checked.</Text> : null}
      <Button variant="default" size="xs" onClick={() => onRetry()}>Try again</Button>
    </Stack></Alert> : null}
    {status === 'ready' ? children : status === 'error' ? null :
      <Paper withBorder p="lg" role="status" aria-label="Loading data">
        <Stack gap="md"><Skeleton height={22} width="35%" animate={false} />
          {[0, 1, 2].map(row => <Skeleton key={row} height={48} animate={false} />)}
        </Stack>
      </Paper>}
  </>;
}
