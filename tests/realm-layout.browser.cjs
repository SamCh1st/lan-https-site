const {chromium} = require(process.env.TABLETOP_PLAYWRIGHT || 'C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const out = path.join(__dirname, 'artifacts', 'realm-layout');
  fs.mkdirSync(out, {recursive:true});
  try {
    for (const username of ['DicePlayerQA', 'TabletopQA']) {
      const context = await browser.newContext({ignoreHTTPSErrors:true, viewport:{width:1440,height:1000}});
      const base = process.env.REALM_PREVIEW_URL || 'https://127.0.0.1:8766';
      assert.equal((await context.request.post(base+'/api/login', {data:{username,password:'Tabletop-QA-12345'}})).ok(), true);
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', e => { errors.push(e.message); console.error('Browser error:',e.stack); });
      await page.goto(base);
      await page.locator('.campaign-row').first().waitFor();
      if (username === 'DicePlayerQA') {
        await page.locator('#campaignSearch').fill('Dice QA Normal');
        assert.equal(await page.locator('.campaign-row:visible').count(), 1);
        await page.locator('#campaignSearch').fill('');
        await page.screenshot({path:path.join(out,'library-light.png'),animations:'disabled'});
      }
      for (const campaign of ['Normal', 'AI']) {
        await page.locator('.campaign-row').filter({hasText:'Dice QA '+campaign}).click();
        await page.locator('#campaignDashboard').waitFor();
        for (const width of [1440,768,390]) {
          await page.setViewportSize({width,height:width===390?844:1000});
          for (const theme of ['light','dark']) {
            const dark = await page.evaluate(() => document.documentElement.dataset.theme === 'dark');
            if (dark !== (theme === 'dark')) await page.locator('#themeToggle').click();
            const layout = await page.evaluate(() => {
              const stage=document.querySelector('.map-stage').getBoundingClientRect();
              const root=document.querySelector('#campaignDashboard').getBoundingClientRect();
              const rails=[...document.querySelectorAll('#campaignDashboard > .dashboard-rail')].filter(e=>e.getBoundingClientRect().width);
              const brand=document.querySelector('.navbar-brand').getBoundingClientRect();
              const menu=document.querySelector('#realmMenuButton').getBoundingClientRect();
              return {
                menuOverlapsBrand:menu.right>brand.left && menu.bottom>brand.top && menu.top<brand.bottom,
                overflow:document.documentElement.scrollWidth-innerWidth,
                stage:{x:stage.x,y:stage.y,right:stage.right,width:stage.width,height:stage.height},
                root:{x:root.x,right:root.right},
                rails:rails.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,right:e.getBoundingClientRect().right})),
                visibleFullscreen:[...document.querySelectorAll('#mapWorkspaceHeader [data-map-fullscreen],#mapFullscreen,.map2-view-controls [data-map-fullscreen]')].filter(e=>e.getBoundingClientRect().width).length
              };
            });
            assert.ok(layout.overflow<=1, JSON.stringify({username,campaign,width,theme,...layout}));
            assert.equal(layout.menuOverlapsBrand,false,'Navigation must not obscure the site identity');
            assert.ok(layout.stage.x>=layout.root.x-1 && layout.stage.right<=layout.root.right+1);
            assert.ok(layout.stage.height>=450);
            if(width<=900) assert.ok(layout.rails.every(r=>r.y>=layout.stage.y+layout.stage.height-1), 'Supporting tools must follow the map on small screens');
            if(campaign==='Normal') assert.equal(layout.visibleFullscreen,1,'Only one fullscreen entry point');
            if(username==='DicePlayerQA' && width!==768) {
              await page.evaluate(()=>window.scrollTo(0,0));
              await page.screenshot({path:path.join(out,`${campaign}-${width}-${theme}.png`),animations:'disabled',timeout:10000});
            }
            console.log('PASS',username,campaign,width,theme);
          }
        }
        await page.setViewportSize({width:1440,height:1000});
        await page.locator('#campaignBack').click();
        await page.locator('#campaignLanding').waitFor({state:'visible'});
      }
      // Open and close the existing editors without replacing their own grids.
      await page.locator('.campaign-row').filter({hasText:'Dice QA Normal'}).click();
      for(const [button,panel] of [['#spellAtelierButton','#spellAtelier'],['#artAtelierButton','#artAtelier']]) {
        await page.locator('#realmMenuButton').click();
        await page.locator(button).click();
        await page.locator(panel).waitFor({state:'visible'});
        assert.equal(await page.locator('.map-stage').isVisible(),false);
        await page.setViewportSize({width:390,height:844});
        const overflow = await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().width && e.getBoundingClientRect().right>innerWidth+1).slice(-20).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right}))}));
        assert.ok(overflow.scroll<=overflow.width+1,JSON.stringify({username,panel,...overflow}));
        await page.setViewportSize({width:1440,height:1000});
      }
      assert.deepEqual(errors,[]);
      await context.close();
    }
  } finally { await browser.close(); }
  console.log('PASS responsive themes, player/DM campaigns, search, fullscreen controls and atelier navigation');
})().catch(error => { console.error(error); process.exitCode=1; });
