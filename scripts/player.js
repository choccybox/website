let currentProgress = 0;
let currentDuration = 0;
let isPlaying = false;

function fetchAndDisplayTime() {
    fetch('/player')
        .then(response => response.json())
        .then(data => {
            isPlaying = data.isPlaying;

            if (isPlaying) {
                console.log(`🟢 playing\n📰 name: ${data.name} • ${data.artist}\n🔗 url: ${data.url}\n🎨 art (high): ${data.art.high}\n🎨 art (low): ${data.art.low}`);


                // if no art, use spong
                if (data.art === null) {
                    document.getElementById("player_image").src = "./styles/spong.webp";
                } else {
                    // Use art.low if the user is on mobile data
                    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                    const isMobileConnection = connection && connection.effectiveType === 'cellular';
                    console.log("🔎 is on cellular player?", isMobileConnection);

                    document.getElementById("player_image").src = isMobileConnection ? data.art.low : data.art.high;
                }

                // if no url, remove target attribute
                if (data.url === null) {
                    document.getElementById("player_link").removeAttribute("target");
                } else {
                    document.getElementById("player_link").href = data.url;
                }

                // if source is spotify, color the progress bar green
                if (data.source === "spotify") {
                    document.getElementById("player_progress").style.backgroundColor = "#1DB954";
                } else if (data.source === "soundcloud") {
                    document.getElementById("player_progress").style.backgroundColor = "#FF5500";
                } else {
                    document.getElementById("player_progress").style.backgroundColor = "#FFFFFF";
                }

                document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;
                document.getElementById("player_timeline").style.backgroundColor = "var(--timeline)";

                currentProgress = data.progress || 0;
                currentDuration = data.duration || 0;

                const progressPercentage = (currentProgress / currentDuration) * 100;
                document.getElementById("player_progress").style.width = progressPercentage + "%";


                if (currentProgress >= currentDuration) {
                    fetchAndDisplayTime();
                }
            } else {
                console.log(`🔴 not playing\n📰 name: ${data.name} • ${data.artist}\n🔗 url: ${data.url}\n🎨 art (high): ${data.art.high}\n🎨 art (low): ${data.art.low}`);
                if (data.art === null) {
                    document.getElementById("player_image").src = "./styles/spong.webp";
                } else {
                    // Use art.low if the user is on mobile data
                    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                    const isMobileConnection = connection && connection.effectiveType === 'cellular';
                    console.log("🔎 is on cellular?", isMobileConnection);

                    document.getElementById("player_image").src = isMobileConnection ? data.art.low : data.art.high;
                }

                if (data.url === null) {
                    document.getElementById("player_link").removeAttribute("target");
                } else {
                    document.getElementById("player_link").href = data.url;
                }

                // if source is spotify, color the progress bar green
                if (data.source === "spotify") {
                    document.getElementById("player_progress").style.backgroundColor = "#1DB954";
                } else if (data.source === "soundcloud") {
                    document.getElementById("player_progress").style.backgroundColor = "#FF5500";
                } else {
                    document.getElementById("player_progress").style.backgroundColor = "#FFFFFF";
                }

                document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;
                document.getElementById("player_link").href = data.url;

                currentProgress = 0;

                document.getElementById("player_progress").style.width = "100%";
            }
        });
}

// Fetch and display time immediately and then every 10 seconds
fetchAndDisplayTime();
setInterval(fetchAndDisplayTime, 10000);

// Update fake progress only when playing
function updateFakeProgressBar() {
    if (isPlaying && currentProgress < currentDuration) {
        // each second, add however much the progress bar has progressed
        currentProgress += 1000;

        // set width of progress bar
        const progressPercentage = (currentProgress / currentDuration) * 100;
        // round to 4 decimal places
        console.log("⏯ progress:", progressPercentage.toFixed(0) + "%");
        document.getElementById("player_progress").style.width = progressPercentage + "%";

        if (currentProgress >= currentDuration) {
            // Handle song completion
            fetchAndDisplayTime();
        }
    } else {
        // Handle playback stop
        currentProgress = 0;
    }
}

// Update fake progress every second
setInterval(updateFakeProgressBar, 1000);
