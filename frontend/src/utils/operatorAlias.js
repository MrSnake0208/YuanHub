const PINYIN_SYLLABLES = new Set(`
  a ai an ang ao e ei en eng er o ou
  ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu
  pa pai pan pang pao pei pen peng pi pia pian piao pie pin ping po pou pu
  ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu
  fa fan fang fei fen feng fiao fo fou fu
  da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo
  ta tai tan tang tao te tei teng ti tian tiao tie ting tong tou tu tuan tui tun tuo
  na nai nan nang nao ne nei nen neng ni nia nian niang niao nie nin ning niu nong nou nu nuan nun nuo nv nve nue
  la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan lun luo lv lve lue
  ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo
  ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo
  ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo
  ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun jv jvan jve jvn
  qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun qv qvan qve qvn
  xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun xv xvan xve xvn
  zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo
  cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo
  sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo
  ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo
  za zai zan zang zao ze zei zen zeng zi zong zou zu zuan zui zun zuo
  ca cai can cang cao ce cei cen ceng ci cong cou cu cuan cui cun cuo
  sa sai san sang sao se sen seng si song sou su suan sui sun suo
  ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun yv yvan yve yvn
  wa wai wan wang wei wen weng wo wu
`.trim().split(/\s+/))

export function generateOperatorAlias(id, name) {
  if (typeof id !== 'string' || typeof name !== 'string') return null
  const match = id.match(/^char_\d+_(.+)$/)
  if (!match || match[0] !== id || !/^[A-Za-z]+$/.test(match[1])) return null
  const pinyin = match[1].toLowerCase()
  const fullName = name.trim()
  const han = fullName.match(/\p{Script=Han}/gu) || []
  if (!han.length || han.join('') !== fullName) return null
  if (pinyin.length < han.length || pinyin.length > han.length * 6) return null

  let states = new Map([[0, { initials: '', penalty: 0 }]])
  for (let count = 0; count < han.length; count++) {
    const next = new Map()
    for (const [start, state] of states) {
      for (let end = start + 1; end <= Math.min(start + 6, pinyin.length); end++) {
        const syllable = pinyin.slice(start, end)
        if (!PINYIN_SYLLABLES.has(syllable)) continue
        // 没有隔音符时，优先避免后续音节以 a/o/e 开头。
        const penalty = state.penalty + (count > 0 && /^[aoe]/.test(syllable) ? 1 : 0)
        const previous = next.get(end)
        if (!previous || penalty < previous.penalty) {
          next.set(end, { initials: state.initials + syllable[0], penalty })
        }
      }
    }
    if (!next.size) return null
    states = next
  }
  const result = states.get(pinyin.length)
  return result ? `${pinyin} ${result.initials} “${fullName}” ${fullName}` : null
}
