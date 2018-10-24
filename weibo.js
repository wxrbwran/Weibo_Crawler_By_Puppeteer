const puppeteer = require('puppeteer');
const qs = require('qs');
const { weibo } = require('./config.json');
const program = require('commander');
const { knex } = require('./db');
const dayjs = require('dayjs');

program
  .option('-p, --password [value]', '待翻译的英文')
  .option('-t, --title [value]', '待爬取用户名')
  .parse(process.argv);

const jQueryPath = 'https://cdn.bootcss.com/jquery/3.3.1/jquery.min.js';
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
// url:https://weibo.com/rmrb?is_hot=1&profile_ftype=1&page=1
const userName = weibo.username;
const passWord = program.password || weibo.password;

const waitCrawledUser = `https://weibo.com/${program.title || 'rmrb'}`;
console.log(waitCrawledUser);

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
  });
  const page = await browser.newPage();
  await page.setViewport({width: 1000, height: 900});
  /**
   * 滚动加在到分页bar出来
   * @return {[type]} [description]
   */
  let scrollToPageBar = async function() {
    let pageBar = await page.$("div[node-type=feed_list_page]");
    while (!pageBar) {
      // 传递命令给浏览器，让浏览器执行滚动
      await page.evaluate((scrollStep)=>{
        let scrollTop = document.scrollingElement.scrollTop;
        document.scrollingElement.scrollTop = scrollTop + scrollStep;
      }, 1000);
      await sleep(500);
      pageBar = await page.$("div[node-type=feed_list_page]");
    }
  };
  /**
   * 点击下一页面按钮
   * @return {[type]} [description]
   */
  let gotoNextPage = async function(pageNum) {
    await page.goto(`${waitCrawledUser}?is_search=0&visible=0&is_ori=1&is_tag=0&profile_ftype=1&page=${pageNum}#feedtop`);
    await page.addScriptTag({ url: jQueryPath });
  };

  /**
   * 获取带抓取微博的总页数
   * @return {[type]} [description]
   */
  let getTotalPage = async function() {
    await scrollToPageBar();
    // 发送命令获取总页数
    let pageInfo = await page.evaluate(() => {
      const $ = window.$;
      let pageMore = $("a[action-type=feed_list_page_more]");
      let pageInfo = pageMore.attr("action-data");
      return pageInfo;
    });
    let pageInfoObj = qs.parse(pageInfo);
    return pageInfoObj.countPage;
  };

  /**
   * 抓取当前页面的微博
   * @return {[type]} [description]
   */
  let weiboPageInfo = async function(pageNum) {
    await scrollToPageBar();
    const res = await page.evaluate(() => {
      const $ = window.$;
      const lists = document.querySelectorAll('div[action-type=feed_list_item]');
      return Array.from(lists).map(list => {
        const $list = $(list);
        const weiboInfo = {
          "tbinfo": $list.attr("tbinfo"),
          "mid": $list.attr("mid"),
          "isforward": $list.attr("isforward"),
          "minfo": $list.attr("minfo"),
          "omid": $list.attr("omid"),
          "text": $list.find(".WB_detail>.WB_text").text().trim(),
          'link': $list.find(".WB_detail>.WB_from a").eq(0).attr("href"),
          "sendAt": +$list.find(".WB_detail>.WB_from a").eq(0).attr("date")
        };
        if (weiboInfo.isforward) {
          const forward = $list.find("div[node-type=feed_list_forwardContent]");
          if (forward.length > 0) {
            const forwardUser = forward.find("a[node-type=feed_list_originNick]");
            const userCard = forwardUser.attr("usercard");
            weiboInfo.forward = {
              name: forwardUser.attr("nick-name"),
              id: userCard ? userCard.split("=")[1] : "error",
              text: forward.find(".WB_text").text().trim(),
              "sendAt": $list.find(".WB_detail>.WB_from a").eq(0).attr("date")
            };
          }
        }
        return weiboInfo;
      });
    });
    return res;
  };

  await page.goto(waitCrawledUser);
  await page.waitForNavigation();
  await page.click('a[node-type=loginBtn]');
  await page.waitForNavigation({
    waitUntil: 'networkidle2'
  });
  await page.type('input[node-type=username]', userName);
  await page.type('input[node-type=password]', passWord);
  await page.click('a[action-type=btn_submit]');
  await page.waitForNavigation({
    waitUntil: 'networkidle2'
  });
  await page.addScriptTag({url: jQueryPath});

  const totalPage = await getTotalPage();
  const crawlerPage = weibo.crawler_count >= totalPage ? totalPage : weibo.crawler_count;

  let pageNum = 1;
  let result = [];
  while (pageNum <= crawlerPage) {
    console.log("开始抓取第["+pageNum+"]页数据...");
    const res = await weiboPageInfo(pageNum);
    result = [...result, ...res];
    console.log("第["+pageNum+"]页数据抓取结束");
    pageNum++;
    await gotoNextPage(pageNum);
  }
  console.log("\n\n抓取结束");
  console.log(result);
  const length = result.length;
  if (length > 0) {
    for (let i = 0; i < length; i++) {
      const info = result[i];
      console.log(info);
      info.sendAt = dayjs(info.sendAt).format('YYYY-MM-DD HH:mm:ss');
      try {
        const id = await knex.withSchema('test')
          .returning('id')
          .insert(info)
          .into('weibo');
        console.log(id);
      } catch (e) {
        console.log(e);
        break;
      }
    }
  }
})();
