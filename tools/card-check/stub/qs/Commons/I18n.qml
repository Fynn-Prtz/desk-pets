pragma Singleton
import QtQuick
QtObject { function formatNumber(v, d) { return Number(v).toFixed(d || 0) } }
