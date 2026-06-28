import React, { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { api } from '../api'
import { Card } from './Task1'
import { Counter } from '../hooks/useCountUp'
import { synthesisRadarOption } from '../charts6'

// 五维发现速览（一句话 + 跳回对应任务）
const RECAP = [
  { id: 'task1', n: '一', t: '行当分类', d: '逻辑回归按特征与台词推断未标注角色行当，并显式标注低置信待核样本。' },
  { id: 'task2', n: '二', t: '角色关系网络', d: '公案戏规模最大、历史戏阵营最分明、家庭戏小而密。' },
  { id: 'task3', n: '三', t: '主题母题', d: '实体净化后 LDA 得 10 个动作母题：征战 / 忠义复仇 / 婚姻家庭 / 断狱…' },
  { id: 'task4', n: '四', t: '叙事弧线', d: '唱念做打合成戏剧强度，聚出 5 种典型弧线，高潮多置后半。' },
  { id: 'task5', n: '五', t: '综合关联', d: '关系×主题×叙事×行当四维显著协同，归纳 6 类综合原型。' },
]

const LIMITS = [
  '净 / 丑细分标注稀疏且体系非标准（缺铜锤、架子等核心区分），故仅展示已标注细分、不作推断。',
  '数据集为京剧剧本文本，无地理、唱腔音频与舞台调度信息——开篇的戏曲地图为戏曲史策展内容，非数据驱动。',
  'LDA 主题为「动作母题」（攻打 / 自刎 / 投江…）而非文学主题，是对情节用词的统计归纳。',
  '剧目类型由关键词规则分类、历史时期由来源集合粗粒度映射，均为近似而非权威断代。',
]

const FUTURE = [
  { t: '跨剧种对比', d: '把同一套分析方法推广到越剧、豫剧、川剧等其他剧种，比较它们在同类题材上的异同。' },
  { t: '声腔与曲谱', d: '引入唱腔曲牌、板式和音频数据，把「唱念做打」从文本标记扩展到声音层面。' },
  { t: '情感分析', d: '在戏剧强度之外，再加入人物的情感倾向，更细致地刻画剧情的悲喜起伏。' },
  { t: '用于教学普及', d: '把多维联动档案做成戏曲普及与教学用的交互读物，让数据更好地服务于戏曲传承。' },
]

export default function Conclusion({ goto }) {
  const [quality, setQuality] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [corr, setCorr] = useState(null)
  const [archetypes, setArchetypes] = useState(null)

  useEffect(() => {
    api.quality().then(setQuality).catch(() => {})
    api.metrics().then(setMetrics).catch(() => {})
    api.synCorr().then(setCorr).catch(() => {})
    api.synArchetypes().then((d) => setArchetypes(d.archetypes)).catch(() => {})
  }, [])

  const top = corr?.findings?.[0]
  const nSig = corr?.n_significant
  const nTests = corr?.n_tests
  const f1 = metrics ? (metrics.macro_f1 * 100).toFixed(1) : null

  return (
    <div className="conclusion">
      <div className="module-head">
        <div>
          <h1>结语 · 总结与展望</h1>
          <p>从行当到叙事，五项分析最终指向一致的结论，同时也留下了若干可以继续研究的问题。</p>
        </div>
      </div>

      {/* 一以贯之的故事 */}
      <Card title="整体结论 · 数据概要"
        hint="五个维度并不是相互独立的：人物关系、题材主题、叙事节奏与行当构成之间，存在稳定而显著的关联。">
        <div className="concl-story">
          <p>
            把 <b>{quality ? <Counter value={quality.parsed} /> : '1473'}</b> 部京剧剧本拆成
            行当、关系网络、主题、叙事四个维度再综合来看，可以归纳出两类相反的稳定结构：
          </p>
          <div className="story-twin">
            <div className="twin-card hot">
              <div className="twin-h">武戏类（以历史戏为代表）</div>
              网络规模大 · 征战主题 · 武打逐渐增强 · 以<b>净行</b>为主——敌我阵营分明、高潮多在后段。
            </div>
            <div className="twin-vs">⟷</div>
            <div className="twin-card cool">
              <div className="twin-h">文戏类（以家庭戏为代表）</div>
              网络规模小 · 婚姻家庭主题 · 以抒情为主 · 以<b>旦行</b>为主——人物少而互动紧密、以唱功见长。
            </div>
          </div>
          {top && (
            <p className="story-stat">
              其中最强的一条关联是 <b>{top.a} ↔ {top.b}</b>，皮尔逊相关
              <b className="hot-num"> r = {top.r > 0 ? '+' : ''}{top.r.toFixed(2)}</b>
              （n = {top.n}，经 FDR 校正显著）。
              {nSig != null && nTests != null &&
                <> 全部 {nTests} 对跨维度关系中，<b>{nSig}</b> 对达到统计显著。</>}
            </p>
          )}
        </div>
      </Card>

      {/* 五维联动总结图 */}
      <Card title="五维度对照 · 两类典型结构"
        hint="把任务五「综合原型」中做打最多和旦行最重的两类放到同一张雷达图上对比——分别看网络规模、模块度、武（做打）、文（唱腔）、净行、旦行六个指标（各轴按全部原型归一）。两条几乎相反的曲线，正好对应上文的「武戏类 / 文戏类」：关系网络、叙事节奏与行当构成会一起变化。">
        {archetypes
          ? <ReactECharts theme="opera-dark" option={synthesisRadarOption(archetypes)} className="echart tall" notMerge />
          : <div className="loading">载入中…</div>}
      </Card>

      {/* 五维发现速览 */}
      <h2 className="intro-h2">五项任务结论速览</h2>
      <div className="concl-recap">
        {RECAP.map((r) => (
          <button className="recap-card" key={r.id} onClick={() => goto(r.id)}>
            <div className="rc-no">任务{r.n}</div>
            <div className="rc-t">{r.t}</div>
            <div className="rc-d">{r.d}</div>
            <div className="rc-go">查看 →</div>
          </button>
        ))}
      </div>

      <div className="grid">
        {/* 诚实边界 */}
        <Card title="方法的局限性"
          hint="为保证结论可信，这里如实说明本分析在数据和方法上的局限。">
          <ul className="concl-list limits">
            {LIMITS.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </Card>

        {/* 数字人文展望 */}
        <Card title="未来展望"
          hint="基于这份京剧剧本数据，后续还可以向更广的戏曲数字人文研究扩展。">
          <div className="future-grid">
            {FUTURE.map((f) => (
              <div className="future-item" key={f.t}>
                <div className="fi-t">{f.t}</div>
                <div className="fi-d">{f.d}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 数据来源 · 致谢 */}
      <Card title="数据来源 · 致谢"
        hint="感谢数据集的编纂者，以及历代京剧艺术工作者。">
        <div className="concl-credits">
          <p>
            数据来自 <b>ChinaVis 2026 赛题 1-I · 京剧数据集</b>，含《戏考》《京剧汇编》等
            {quality ? <> <b><Counter value={Object.keys(quality.by_collection || {}).length} /></b> 个</> : ' 38 个'}
            来源集合、{quality ? <b><Counter value={quality.parsed} /></b> : '1473'} 部剧本、
            {quality ? <b><Counter value={quality.lines} /></b> : '36 万'} 条对白。
            {f1 && <> 任务一行当分类交叉验证 macro-F1 = <b>{f1}%</b>。</>}
          </p>
          <p className="credits-stack">
            技术栈：Python · FastAPI · scikit-learn · NetworkX · React · Vite · ECharts · Electron。
          </p>
        </div>
      </Card>

      <section className="intro-cta">
        <div className="cta-text">感谢浏览。</div>
        <button className="cta-enter ghost" onClick={() => goto('intro')}>重看开篇 ↺</button>
        <button className="cta-enter" onClick={() => goto('overview')}>回到总览 →</button>
      </section>
    </div>
  )
}
