const text = `${custom_text}`
var convertedText = convertTimestamps(text);
document.getElementById("text_outer").innerHTML = convertedText;

function convertTimestamps(text) {
    const timestampRegex = /<t:(\d+):([dtTFr])>/gi;
    const boldRegex = /\*\*(.*?)\*\*/gi;
    const smallRegex = /\^\^(.*?)\^\^/gi;
    const italicRegex = /\*(.*?)\*/gi;
    const underlineRegex = /__(.*?)__/gi;
    const strikeRegex = /~~(.*?)~~/gi;
    const spoilerRegex = /\|\|([^|]+)\|\|/g;
    const codeRegex = /''([^']+)''/g;
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    const flagRegex = /:flag_([a-z]{2}):/gi;
    const twemojiRegex = /([\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}])/gu;
    const superscriptRegex = /#(.*?)#/gi;
    const imageRegex = /\[\[([^\]]+)\]\]/g;
    const bigImageRegex = /\[\!\[(.*?)\]\!\]/g;
    const biggerImageRegex = /\[\!\!\[(.*?)\]\!\!\]/g;
    const biggestImageRegex = /\[\!\!\!\[(.*?)\]\!\!\!\]/g;
    const dividerRegex = /\;\;divider\;\;/g;
    
    const formattedText = text.replace(timestampRegex, (_, timestamp, format) => {
      const date = new Date(parseInt(timestamp) * 1000);
      let formattedDate = '';
      switch (format) {
        case "d":
          formattedDate = date.toLocaleDateString();
          break;
        case "D":
          formattedDate = date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
          break;
        case "t":
          formattedDate = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: localStorage.getItem('clockFormat') === '12-hour' }).replace(/(\d+:\d+)\s([ap]m)/i, '$1 $2').toUpperCase();
          break;
        case "T":
          formattedDate = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: localStorage.getItem('clockFormat') === '12-hour' }).replace(/(\d+:\d+)\s([ap]m)/i, '$1 $2').toUpperCase();
          break;
        case "f":
          formattedDate = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          break;
        case "F":
          formattedDate = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          break;
        case "R":
          formattedDate = timeAgo(parseInt(timestamp));
          break;
        default:
          formattedDate = "";
      }
      return `<span style="background-color:var(--color4);padding-left:5px;padding-right:5px;border-radius:8px;font-size: 26px;white-space: nowrap;" class="timestamp">${formattedDate}</span>`;
    })    
  
      .replace(flagRegex, (match, countryCode) => {
        const countryName = countryCode.toUpperCase();
        const flagUrl = `https://flagicons.lipis.dev/flags/4x3/${countryCode}.svg`;
        return `<img src="${flagUrl}" title="flag of ${countryName}" class="flag-emojis country-flags"/>`;
      }) 
      .replace(twemojiRegex, (match, emoji) => {
        const twemojiUrl = `https://twemoji.maxcdn.com/v/latest/svg/${emoji.codePointAt(0).toString(16)}.svg`;
        return `<img src="${twemojiUrl}" alt="${emoji}" class="emojis"/>`;
      })
.replace(boldRegex, '<span style="font-weight: bold;">$1</span>')
.replace(italicRegex, '<span style="font-style: italic;">$1</span>')
.replace(smallRegex, '<span style="font-size: 1rem;">$1</span>')
.replace(underlineRegex, '<span style="text-decoration: underline;">$1</span>')
.replace(strikeRegex, '<span style="text-decoration: line-through;">$1</span>')
.replace(spoilerRegex, '<span class="spoiler" onclick="this.classList.toggle(\'clicked\')"><span class="inner">$1</span><span class="before"></span></span>')
.replace(codeRegex, '<code>$1</code>')
.replace(linkRegex, '<a href="$2" id="link" target="_blank" style="text-decoration:underline;">$1</a>')
.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
.replace(/\nn/g, "<span style='display:block;'>‎ </span>")
.replace(/\n/g, "<span style='display:block;height:0.25rem'></span>")
.replace(superscriptRegex, '<span style="font-size: 0.7rem;">$1</span>')
.replace(imageRegex, "<img class='emojis' src='$1'/>")
.replace(bigImageRegex, "<img class='emojis-big' src='$1'/>")
.replace(biggerImageRegex, "<img class='emojis-bigger' src='$1'/>")
.replace(biggestImageRegex, "<img class='emojis-biggest' src='$1'/>")
.replace(dividerRegex, "<div class='divider'></div>")

return formattedText;
}