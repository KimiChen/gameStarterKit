/**
 * mapOriginal 地名与城址（s1）—— **生成物，⛔ 勿手改**。
 *
 * 由 `tools/maporiginal-assets/emit_labels.py` 从原版
 * `script/ui/view/map/birdview/season_cfg/s1/{canton,area}_name_info.lua`
 * 与 `asset/config/S1/cn/res_pro/city_center.lua` 派生。
 * ⚠ 原表的 `name` 是 i18n key（`地图文案_西凉`），这里取 `_` 之后的显示名。
 * ⚠ 位置是原表自带的 `grid`（每条地名的落点），⛔ 不是我们算的分区质心。
 */

export interface IMapoLabel {
  readonly name: string;
  readonly row: number;
  readonly col: number;
  /** 郡才有；大区没有。 */
  readonly areaId?: number;
}

export interface IMapoCitySite {
  readonly id: number;
  readonly row: number;
  readonly col: number;
}

/** 大区（9 个）：远档显示。 */
export const MAPO_CANTON_LABELS: readonly IMapoLabel[] = [
  {
    "name": "西凉",
    "row": 154,
    "col": 851
  },
  {
    "name": "山东",
    "row": 957,
    "col": 388
  },
  {
    "name": "河北",
    "row": 423,
    "col": 267
  },
  {
    "name": "巴蜀",
    "row": 579,
    "col": 1292
  },
  {
    "name": "荆楚",
    "row": 1130,
    "col": 1224
  },
  {
    "name": "江东",
    "row": 1345,
    "col": 716
  },
  {
    "name": "司隶",
    "row": 651,
    "col": 605
  },
  {
    "name": "关中",
    "row": 459,
    "col": 793
  },
  {
    "name": "江汉",
    "row": 847,
    "col": 864
  }
];

/** 郡（55 个）：中近档显示。 */
export const MAPO_AREA_LABELS: readonly IMapoLabel[] = [
  {
    "name": "陇西郡",
    "row": 270,
    "col": 1094,
    "areaId": 9
  },
  {
    "name": "金城郡",
    "row": 129,
    "col": 910,
    "areaId": 10
  },
  {
    "name": "朔方郡",
    "row": 74,
    "col": 417,
    "areaId": 11
  },
  {
    "name": "北地郡",
    "row": 160,
    "col": 656,
    "areaId": 12
  },
  {
    "name": "天水郡",
    "row": 293,
    "col": 905,
    "areaId": 13
  },
  {
    "name": "西平郡",
    "row": 133,
    "col": 1158,
    "areaId": 14
  },
  {
    "name": "南安郡",
    "row": 277,
    "col": 992,
    "areaId": 15
  },
  {
    "name": "北海国",
    "row": 869,
    "col": 103,
    "areaId": 36
  },
  {
    "name": "颍川郡",
    "row": 809,
    "col": 505,
    "areaId": 37
  },
  {
    "name": "淮南郡",
    "row": 1130,
    "col": 469,
    "areaId": 38
  },
  {
    "name": "下邳郡",
    "row": 1032,
    "col": 263,
    "areaId": 39
  },
  {
    "name": "汝南郡",
    "row": 911,
    "col": 421,
    "areaId": 40
  },
  {
    "name": "泰山郡",
    "row": 795,
    "col": 197,
    "areaId": 41
  },
  {
    "name": "弋阳郡",
    "row": 988,
    "col": 650,
    "areaId": 42
  },
  {
    "name": "渤海郡",
    "row": 650,
    "col": 142,
    "areaId": 1
  },
  {
    "name": "常山郡",
    "row": 518,
    "col": 191,
    "areaId": 2
  },
  {
    "name": "五原郡",
    "row": 144,
    "col": 205,
    "areaId": 3
  },
  {
    "name": "上郡",
    "row": 250,
    "col": 384,
    "areaId": 4
  },
  {
    "name": "太原郡",
    "row": 428,
    "col": 418,
    "areaId": 5
  },
  {
    "name": "魏郡",
    "row": 617,
    "col": 364,
    "areaId": 6
  },
  {
    "name": "雁门郡",
    "row": 329,
    "col": 195,
    "areaId": 7
  },
  {
    "name": "燕国",
    "row": 437,
    "col": 58,
    "areaId": 8
  },
  {
    "name": "巴郡",
    "row": 778,
    "col": 1289,
    "areaId": 16
  },
  {
    "name": "汉嘉郡",
    "row": 508,
    "col": 1441,
    "areaId": 17
  },
  {
    "name": "牂柯郡",
    "row": 837,
    "col": 1440,
    "areaId": 18
  },
  {
    "name": "蜀郡",
    "row": 558,
    "col": 1336,
    "areaId": 19
  },
  {
    "name": "巴西郡",
    "row": 623,
    "col": 1134,
    "areaId": 20
  },
  {
    "name": "阴平郡",
    "row": 415,
    "col": 1154,
    "areaId": 21
  },
  {
    "name": "梓潼郡",
    "row": 334,
    "col": 1390,
    "areaId": 22
  },
  {
    "name": "桂阳郡",
    "row": 1281,
    "col": 1201,
    "areaId": 23
  },
  {
    "name": "衡阳郡",
    "row": 1060,
    "col": 1101,
    "areaId": 24
  },
  {
    "name": "零陵郡",
    "row": 1141,
    "col": 1306,
    "areaId": 25
  },
  {
    "name": "武陵郡",
    "row": 910,
    "col": 1141,
    "areaId": 26
  },
  {
    "name": "长沙郡",
    "row": 1144,
    "col": 992,
    "areaId": 27
  },
  {
    "name": "南海郡",
    "row": 1393,
    "col": 1411,
    "areaId": 28
  },
  {
    "name": "郁林郡",
    "row": 1098,
    "col": 1440,
    "areaId": 29
  },
  {
    "name": "豫章郡",
    "row": 1226,
    "col": 912,
    "areaId": 30
  },
  {
    "name": "丹阳郡",
    "row": 1290,
    "col": 449,
    "areaId": 31
  },
  {
    "name": "会稽郡",
    "row": 1442,
    "col": 469,
    "areaId": 32
  },
  {
    "name": "临川郡",
    "row": 1379,
    "col": 904,
    "areaId": 33
  },
  {
    "name": "庐陵郡",
    "row": 1416,
    "col": 1133,
    "areaId": 34
  },
  {
    "name": "鄱阳郡",
    "row": 1323,
    "col": 731,
    "areaId": 35
  },
  {
    "name": "河南尹",
    "row": 705,
    "col": 585,
    "areaId": 53
  },
  {
    "name": "河内郡",
    "row": 553,
    "col": 528,
    "areaId": 54
  },
  {
    "name": "弘农郡",
    "row": 625,
    "col": 663,
    "areaId": 55
  },
  {
    "name": "冯翊郡",
    "row": 407,
    "col": 625,
    "areaId": 43
  },
  {
    "name": "扶风郡",
    "row": 409,
    "col": 837,
    "areaId": 44
  },
  {
    "name": "汉中郡",
    "row": 502,
    "col": 932,
    "areaId": 45
  },
  {
    "name": "京兆郡",
    "row": 555,
    "col": 755,
    "areaId": 46
  },
  {
    "name": "安定郡",
    "row": 338,
    "col": 759,
    "areaId": 47
  },
  {
    "name": "江夏郡",
    "row": 1076,
    "col": 817,
    "areaId": 48
  },
  {
    "name": "南郡",
    "row": 885,
    "col": 915,
    "areaId": 49
  },
  {
    "name": "南阳郡",
    "row": 888,
    "col": 755,
    "areaId": 50
  },
  {
    "name": "上庸郡",
    "row": 707,
    "col": 978,
    "areaId": 51
  },
  {
    "name": "襄阳郡",
    "row": 783,
    "col": 819,
    "areaId": 52
  }
];

/** 城址（249 座）：原版 `city_center.lua` 的**真坐标**，⛔ 无名字（名字在服务端 AOI 里）。 */
export const MAPO_CITY_SITES: readonly IMapoCitySite[] = [{"id": 1, "row": 648, "col": 107}, {"id": 2, "row": 688, "col": 216}, {"id": 3, "row": 586, "col": 40}, {"id": 4, "row": 619, "col": 142}, {"id": 5, "row": 465, "col": 208}, {"id": 6, "row": 482, "col": 157}, {"id": 7, "row": 516, "col": 247}, {"id": 8, "row": 601, "col": 225}, {"id": 9, "row": 559, "col": 144}, {"id": 10, "row": 159, "col": 201}, {"id": 11, "row": 82, "col": 256}, {"id": 12, "row": 202, "col": 139}, {"id": 13, "row": 319, "col": 485}, {"id": 14, "row": 267, "col": 420}, {"id": 15, "row": 209, "col": 305}, {"id": 16, "row": 441, "col": 495}, {"id": 17, "row": 416, "col": 379}, {"id": 18, "row": 467, "col": 386}, {"id": 19, "row": 363, "col": 402}, {"id": 20, "row": 456, "col": 456}, {"id": 21, "row": 695, "col": 364}, {"id": 22, "row": 574, "col": 366}, {"id": 23, "row": 644, "col": 275}, {"id": 24, "row": 335, "col": 210}, {"id": 25, "row": 362, "col": 288}, {"id": 26, "row": 275, "col": 97}, {"id": 27, "row": 500, "col": 36}, {"id": 28, "row": 330, "col": 50}, {"id": 29, "row": 554, "col": 87}, {"id": 30, "row": 404, "col": 58}, {"id": 31, "row": 273, "col": 1045}, {"id": 32, "row": 301, "col": 1133}, {"id": 33, "row": 260, "col": 1095}, {"id": 34, "row": 186, "col": 1084}, {"id": 35, "row": 248, "col": 1042}, {"id": 36, "row": 213, "col": 1059}, {"id": 37, "row": 57, "col": 870}, {"id": 38, "row": 164, "col": 1054}, {"id": 39, "row": 63, "col": 391}, {"id": 40, "row": 19, "col": 308}, {"id": 41, "row": 33, "col": 466}, {"id": 42, "row": 207, "col": 592}, {"id": 43, "row": 222, "col": 806}, {"id": 44, "row": 216, "col": 728}, {"id": 45, "row": 143, "col": 807}, {"id": 46, "row": 288, "col": 943}, {"id": 47, "row": 339, "col": 924}, {"id": 48, "row": 270, "col": 836}, {"id": 49, "row": 334, "col": 976}, {"id": 50, "row": 315, "col": 873}, {"id": 51, "row": 72, "col": 1060}, {"id": 52, "row": 125, "col": 992}, {"id": 53, "row": 47, "col": 1129}, {"id": 54, "row": 285, "col": 1036}, {"id": 55, "row": 316, "col": 1040}, {"id": 56, "row": 248, "col": 981}, {"id": 57, "row": 743, "col": 1287}, {"id": 58, "row": 781, "col": 1217}, {"id": 59, "row": 883, "col": 1320}, {"id": 60, "row": 718, "col": 1374}, {"id": 61, "row": 453, "col": 1461}, {"id": 62, "row": 516, "col": 1417}, {"id": 63, "row": 560, "col": 1475}, {"id": 64, "row": 774, "col": 1416}, {"id": 65, "row": 870, "col": 1397}, {"id": 66, "row": 851, "col": 1485}, {"id": 67, "row": 975, "col": 1481}, {"id": 68, "row": 470, "col": 1353}, {"id": 69, "row": 558, "col": 1317}, {"id": 70, "row": 648, "col": 1371}, {"id": 71, "row": 624, "col": 1257}, {"id": 72, "row": 477, "col": 1264}, {"id": 73, "row": 546, "col": 1159}, {"id": 74, "row": 550, "col": 1044}, {"id": 75, "row": 651, "col": 1166}, {"id": 76, "row": 684, "col": 1104}, {"id": 77, "row": 330, "col": 1190}, {"id": 78, "row": 387, "col": 1060}, {"id": 79, "row": 428, "col": 1154}, {"id": 80, "row": 423, "col": 1234}, {"id": 81, "row": 388, "col": 1292}, {"id": 82, "row": 346, "col": 1326}, {"id": 83, "row": 362, "col": 1446}, {"id": 84, "row": 407, "col": 1368}, {"id": 85, "row": 272, "col": 1428}, {"id": 86, "row": 1259, "col": 1162}, {"id": 87, "row": 1318, "col": 1236}, {"id": 88, "row": 1398, "col": 1282}, {"id": 89, "row": 1210, "col": 1124}, {"id": 90, "row": 1084, "col": 1057}, {"id": 91, "row": 1020, "col": 1003}, {"id": 92, "row": 1139, "col": 1132}, {"id": 93, "row": 1040, "col": 1269}, {"id": 94, "row": 1279, "col": 1350}, {"id": 95, "row": 1122, "col": 1282}, {"id": 96, "row": 1159, "col": 1364}, {"id": 97, "row": 978, "col": 1000}, {"id": 98, "row": 959, "col": 1286}, {"id": 99, "row": 824, "col": 1155}, {"id": 100, "row": 840, "col": 1020}, {"id": 101, "row": 1080, "col": 1007}, {"id": 102, "row": 1137, "col": 1034}, {"id": 103, "row": 1117, "col": 960}, {"id": 104, "row": 1226, "col": 1033}, {"id": 105, "row": 1065, "col": 944}, {"id": 106, "row": 1464, "col": 1338}, {"id": 107, "row": 1418, "col": 1307}, {"id": 108, "row": 1486, "col": 1424}, {"id": 109, "row": 1364, "col": 1368}, {"id": 110, "row": 1149, "col": 1470}, {"id": 111, "row": 1048, "col": 1482}, {"id": 112, "row": 1037, "col": 1445}, {"id": 113, "row": 998, "col": 1378}, {"id": 114, "row": 1192, "col": 836}, {"id": 115, "row": 1166, "col": 894}, {"id": 116, "row": 1259, "col": 957}, {"id": 117, "row": 1215, "col": 970}, {"id": 118, "row": 1206, "col": 387}, {"id": 119, "row": 1283, "col": 252}, {"id": 120, "row": 1260, "col": 491}, {"id": 121, "row": 1332, "col": 300}, {"id": 122, "row": 1291, "col": 581}, {"id": 123, "row": 1410, "col": 360}, {"id": 124, "row": 1479, "col": 350}, {"id": 125, "row": 1380, "col": 434}, {"id": 126, "row": 1471, "col": 544}, {"id": 127, "row": 1342, "col": 869}, {"id": 128, "row": 1424, "col": 854}, {"id": 129, "row": 1290, "col": 866}, {"id": 130, "row": 1321, "col": 946}, {"id": 131, "row": 1367, "col": 1054}, {"id": 132, "row": 1447, "col": 1156}, {"id": 133, "row": 1444, "col": 1066}, {"id": 134, "row": 1329, "col": 998}, {"id": 135, "row": 1243, "col": 772}, {"id": 136, "row": 1160, "col": 714}, {"id": 137, "row": 1278, "col": 664}, {"id": 138, "row": 1436, "col": 756}, {"id": 139, "row": 1344, "col": 721}, {"id": 140, "row": 880, "col": 91}, {"id": 141, "row": 804, "col": 91}, {"id": 142, "row": 928, "col": 124}, {"id": 143, "row": 939, "col": 180}, {"id": 144, "row": 770, "col": 398}, {"id": 145, "row": 758, "col": 453}, {"id": 146, "row": 822, "col": 561}, {"id": 147, "row": 855, "col": 468}, {"id": 148, "row": 1047, "col": 269}, {"id": 149, "row": 1105, "col": 426}, {"id": 150, "row": 1064, "col": 346}, {"id": 151, "row": 1168, "col": 607}, {"id": 152, "row": 1116, "col": 547}, {"id": 153, "row": 959, "col": 218}, {"id": 154, "row": 1025, "col": 209}, {"id": 155, "row": 1082, "col": 215}, {"id": 156, "row": 1148, "col": 233}, {"id": 157, "row": 974, "col": 448}, {"id": 158, "row": 903, "col": 442}, {"id": 159, "row": 1056, "col": 543}, {"id": 160, "row": 859, "col": 364}, {"id": 161, "row": 873, "col": 232}, {"id": 162, "row": 828, "col": 191}, {"id": 163, "row": 793, "col": 240}, {"id": 164, "row": 752, "col": 141}, {"id": 165, "row": 940, "col": 679}, {"id": 166, "row": 986, "col": 612}, {"id": 167, "row": 1029, "col": 709}, {"id": 168, "row": 1045, "col": 630}, {"id": 169, "row": 457, "col": 606}, {"id": 170, "row": 403, "col": 581}, {"id": 171, "row": 393, "col": 664}, {"id": 172, "row": 421, "col": 544}, {"id": 173, "row": 460, "col": 810}, {"id": 174, "row": 411, "col": 874}, {"id": 175, "row": 367, "col": 873}, {"id": 176, "row": 408, "col": 822}, {"id": 177, "row": 479, "col": 973}, {"id": 178, "row": 567, "col": 921}, {"id": 179, "row": 488, "col": 919}, {"id": 180, "row": 511, "col": 742}, {"id": 181, "row": 512, "col": 666}, {"id": 182, "row": 589, "col": 768}, {"id": 183, "row": 470, "col": 682}, {"id": 184, "row": 314, "col": 784}, {"id": 185, "row": 384, "col": 747}, {"id": 186, "row": 333, "col": 841}, {"id": 187, "row": 354, "col": 806}, {"id": 188, "row": 1045, "col": 772}, {"id": 189, "row": 1092, "col": 743}, {"id": 190, "row": 1113, "col": 823}, {"id": 191, "row": 925, "col": 929}, {"id": 192, "row": 812, "col": 975}, {"id": 193, "row": 864, "col": 957}, {"id": 194, "row": 976, "col": 880}, {"id": 195, "row": 871, "col": 746}, {"id": 196, "row": 776, "col": 714}, {"id": 197, "row": 813, "col": 735}, {"id": 198, "row": 916, "col": 792}, {"id": 199, "row": 709, "col": 984}, {"id": 200, "row": 748, "col": 940}, {"id": 201, "row": 773, "col": 1004}, {"id": 202, "row": 659, "col": 908}, {"id": 203, "row": 895, "col": 825}, {"id": 204, "row": 836, "col": 826}, {"id": 205, "row": 942, "col": 855}, {"id": 206, "row": 661, "col": 543}, {"id": 207, "row": 739, "col": 559}, {"id": 208, "row": 724, "col": 607}, {"id": 209, "row": 781, "col": 628}, {"id": 210, "row": 604, "col": 490}, {"id": 211, "row": 551, "col": 525}, {"id": 212, "row": 520, "col": 553}, {"id": 213, "row": 590, "col": 647}, {"id": 214, "row": 647, "col": 652}, {"id": 215, "row": 599, "col": 574}, {"id": 216, "row": 672, "col": 700}, {"id": 217, "row": 679, "col": 496}, {"id": 218, "row": 623, "col": 580}, {"id": 219, "row": 668, "col": 466}, {"id": 220, "row": 483, "col": 1054}, {"id": 221, "row": 396, "col": 972}, {"id": 222, "row": 980, "col": 1424}, {"id": 223, "row": 761, "col": 1134}, {"id": 224, "row": 542, "col": 643}, {"id": 225, "row": 494, "col": 600}, {"id": 226, "row": 466, "col": 542}, {"id": 227, "row": 360, "col": 568}, {"id": 228, "row": 731, "col": 222}, {"id": 229, "row": 746, "col": 421}, {"id": 230, "row": 276, "col": 544}, {"id": 231, "row": 51, "col": 280}, {"id": 232, "row": 1160, "col": 845}, {"id": 233, "row": 1100, "col": 719}, {"id": 234, "row": 1214, "col": 615}, {"id": 235, "row": 1172, "col": 415}, {"id": 236, "row": 690, "col": 750}, {"id": 237, "row": 800, "col": 684}, {"id": 238, "row": 1390, "col": 1245}, {"id": 239, "row": 1269, "col": 1018}, {"id": 240, "row": 974, "col": 917}, {"id": 241, "row": 845, "col": 981}, {"id": 242, "row": 1025, "col": 758}, {"id": 243, "row": 831, "col": 659}, {"id": 244, "row": 333, "col": 995}, {"id": 245, "row": 248, "col": 1358}, {"id": 246, "row": 287, "col": 822}, {"id": 247, "row": 305, "col": 710}, {"id": 248, "row": 622, "col": 916}, {"id": 249, "row": 652, "col": 831}];
