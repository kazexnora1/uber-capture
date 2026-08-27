({
  VERSION: '2026-08-27-02',

  fixtures: [
    {
      name: '2026-08-26_mcdonalds',
      lines: ['◎合計+13分(+1.2km)', 'マクドナルド 立川立飛店', '立川市柏町4丁目5-29', '→ 返却配送対象'],
      expected: { store: 'マクドナルド 立川立飛店', address: '立川市柏町4丁目5-29' }
    },
    {
      name: '2026-08-26_gusto',
      lines: ['◎合計18分(2.7km)', 'ガスト 国立駅前店 Gusto Kunitachi', 'Ekimae', '国分寺市光町1丁目49-アットイー', 'ス', '承諾'],
      expected: { store: 'ガスト 国立駅前店 Gusto Kunitachi Ekimae', address: '国分寺市光町1丁目49-アットイース' }
    },
    {
      name: '2026-08-26_musashino',
      lines: ['◎合計28分(4.9km)', 'むさしの森珈琲 国立富士見台店', 'Musashino Mori Coffee', 'Kunitachi Fujimidai', '府中市宮西町5丁目11-関田コ', '一求', '承諾'],
      expected: { store: 'むさしの森珈琲 国立富士見台店 Musashino Mori Coffee Kunitachi Fujimidai', address: '府中市宮西町5丁目11-関田コ一求' }
    },
    {
      name: '2026-08-27_yataizushi',
      lines: ['◎合計12分（1.6km）', '◎', 'や台ずし 立川曙町', '立川市曙町2丁目42-23桜乃', '承諾', 'フ', 'ーデン'],
      expected: { store: 'や台ずし 立川曙町', address: '立川市曙町2丁目42-23桜乃' }
    },
    {
      name: '2026-08-27_mcd_isetan',
      lines: ['◎ 合計17分 （21km）', 'マクドナルド 立川伊勢丹前店', '立川市高松町2丁目2 3-3', 'AZEST立】I', 's 返却配送対象', 'コマップ', '承諾'],
      expected: { store: 'マクドナルド 立川伊勢丹前店', address: '立川市高松町2丁目2 3-3AZEST立】I' }
    },
    {
      name: '2026-08-27_ruroufan',
      lines: ['◎合計+8分（+0.9km）', '台湾夜市のルーローハン 立川キッチン', '昭島市東町4丁目1-ハイム藤戸', '承諾'],
      expected: { store: '台湾夜市のルーローハン 立川キッチン', address: '昭島市東町4丁目1-ハイム藤戸' }
    },
    {
      name: '2026-08-27_katsuya',
      lines: ['◎合計21分（1.1km）', 'かつや立川北口 Katsuya', 'Tachikawa Kita', '立川市曙町3丁目2-17', '承諾'],
      expected: { store: 'かつや立川北口 Katsuya Tachikawa Kita', address: '立川市曙町3丁目2-17' }
    }
  ],

  // 住所の開始判定：市区町村名＋丁目/番地 のセットで判断する
  _looksLikeAddressStart: function (s) {
    if (/[都道府県]?.{1,6}[市区町村].*[0-9０-９]/.test(s)) return true;
    if (/[0-9０-９]+丁目/.test(s)) return true;
    return false;
  },

  _isBoundary: function (s) {
    if (/(承諾|キャンセル|完了|返却配送対象)/.test(s)) return true;
    if (/^→/.test(s)) return true;
    return false;
  },

  // 意味のないノイズ行（記号だけ、1文字だけ等）
  _isNoise: function
