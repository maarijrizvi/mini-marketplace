import next from 'eslint-config-next';

const config = [...next, { ignores: ['src/lib/api/schema.d.ts', '.next/**'] }];

export default config;
