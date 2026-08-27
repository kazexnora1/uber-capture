({
  VERSION: '2026-08-26-02',

  fixtures: [
    {
      name: '2026-08-26_mcdonalds',
      lines: [
        '◎合計+13分(+1.2km)',
        'マクドナルド 立川立飛店',
        '立川市柏町4丁目5-29',
        '→ 返却配送対象'
      ],
      expected: { store: 'マクドナルド 立川立飛店', address: '立川市柏町4丁目5-29' }
    },
    {
      name: '2026-08-26_gusto',
      lines: [
        '◎合計18分(2.7km)',
        'ガスト 国立駅前店 Gusto Kunitachi',
        'Ekimae',
        '国分寺市光町1丁目49-アットイー',
        'ス',
        '承諾'
      ],
      expected: { store: 'ガスト 国立駅前店 Gusto Kunitachi Ekimae', address: '国分寺市光町1丁目49-アットイース' }
    },
    {
      name: '2026-08-26_musashino',
      lines: [
        '◎合計28分(4.9km)',
        'むさしの森珈琲 国立富士見台店',
        'Musashino Mori Coffee',
        'Kunitachi Fujimidai',
        '府中市宮西町5丁目11-関田コ',
        '一求',
        '承諾'
      ],
      expected: { store: 'むさしの森珈琲 国立富士
