import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',timeout:30000,fullyParallel:false,workers:1,retries:process.env.CI?1:0,
 reporter:process.env.CI?'github':'list',
 use:{baseURL:'http://127.0.0.1:3100',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
 webServer:{command:'node server/index.mjs',url:'http://127.0.0.1:3100/api/health',reuseExistingServer:!process.env.CI,env:{PORT:'3100',HOST:'127.0.0.1',APP_MODE:'local',LLM_MODEL:'',LLM_API_KEY:'',APP_TOKEN:''}},
});
