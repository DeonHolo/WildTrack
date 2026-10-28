import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installApiFixtures } from './api-fixtures.js';

const workspace='11111111-1111-1111-1111-111111111111';
for(const width of [375,820,1440]) {
  test(`an administrator downloads and previews a workbook before resolving an update at ${width}px`,async({page},testInfo)=>{
    test.setTimeout(60000);
    await page.setViewportSize({width,height:width===375?812:950});
    const fixture=await installApiFixtures(page,{role:'admin'});
    const template=await readFile(new URL('./fixtures/workbook-template.xlsx',import.meta.url));
    const filled=await readFile(new URL('./fixtures/workbook-students.xlsx',import.meta.url));
    const writes=[];
    await page.route('**/api/workbook/**',async route=>{
      const request=route.request(),path=new URL(request.url()).pathname;
      expect(new URL(request.url()).searchParams.get('workspaceId')).toBe(workspace);
      if(path.endsWith('/template'))return route.fulfill({contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',body:template});
      if(path.endsWith('/preview')){
        expect(request.headers()['content-type']).toContain('multipart/form-data; boundary=');
        expect(request.postDataBuffer().includes(filled)).toBe(true);
        return route.fulfill({json:{previewId:'22222222-2222-2222-2222-222222222222',filename:'students.xlsx',addedRows:0,changedRows:1,unchangedRows:1,errors:[],warnings:[],changes:[{
          key:'Students|wb-http-100',sheet:'Students',rowNumber:2,rowKey:'WB-HTTP-100',label:'Alex Rivera',kind:'UPDATE',fields:[{
            key:'Students|wb-http-100|studentName',name:'studentName',label:'Student Name',before:'Alexandra Rivera',after:'Alex Rivera',conflict:true
          }]
        }]}});
      }
      if(path.endsWith('/apply')){
        writes.push(request.postDataJSON());
        return route.fulfill({json:{previewId:'22222222-2222-2222-2222-222222222222',addedRows:0,changedRows:0,unchangedRows:2}});
      }
      throw new Error('Unexpected workbook request');
    });
    await page.goto('/workspace');
    const panel=page.locator('.wt-workbook-import');await panel.scrollIntoViewIfNeeded();
    await expect(panel.getByText(/Student Number, Student Name and Team Code are required/)).toBeVisible();
    const downloadPromise=page.waitForEvent('download');
    await panel.getByRole('button',{name:'Download Excel template'}).click();
    const download=await downloadPromise;
    expect(download.suggestedFilename()).toBe('WildTrack_Workspace_Template.xlsx');
    expect(await readFile(await download.path())).toEqual(template);
    await panel.locator('input[type=file]').setInputFiles({name:'students.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:filled});
    await panel.getByRole('button',{name:'Preview import'}).click();
    const dialog=page.getByRole('dialog',{name:'Review workbook import'});
    await expect(dialog).toHaveCSS('opacity','1');
    const apply=dialog.getByRole('button',{name:'Apply import'});
    await expect(apply).toBeDisabled();
    expect(writes).toEqual([]);
    await expect(dialog.getByText(/Submissions, AI Review results, decisions and account links are kept/)).toBeVisible();
    await dialog.getByRole('combobox',{name:'Alex Rivera: Student Name'}).selectOption('LOCAL');
    await apply.scrollIntoViewIfNeeded();await expect(apply).toBeInViewport({ratio:1});
    expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
    expect(await dialog.getByText('Workbook: Alex Rivera',{exact:true}).evaluate(node=>parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
    await page.screenshot({path:testInfo.outputPath(`workbook-conflict-${width}.png`)});
    await apply.click();
    await expect(page.getByText('Workbook imported',{exact:true})).toBeVisible();
    expect(writes).toEqual([{previewId:'22222222-2222-2222-2222-222222222222',resolutions:{'Students|wb-http-100|studentName':'LOCAL'}}]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`workbook-saved-${width}.png`)});
    fixture.assertRequestsHandled();
  });
}
