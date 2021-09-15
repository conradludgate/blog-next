import { ReactElement, useEffect, useState } from "react";
import styles from "../styles/ThemeButton.module.css";
import moon from "../assets/moon.svg";
import sun from "../assets/sun.svg";
import { useTheme } from "next-themes";

export default function ThemeButton(): ReactElement {
    const { theme, setTheme } = useTheme()

    let Toggle;
    let toggle: string;

    switch (theme) {
        case 'light':
            Toggle = sun;
            toggle = 'dark';
            break
        case 'dark':
            Toggle = moon;
            toggle = 'light';
            break
        default:
            Toggle = sun
            toggle = 'light';
            break
    }

    return <button className={styles.ThemeButton} onClick={() => setTheme(toggle)}>
        <div><Toggle /></div>
    </button>
}

// export default function ThemeButton(): ReactElement {
//     const prefersDark = useMedia({ prefersColorScheme: "dark" });
//     const [theme, setTheme] = useState(getCurrentThemeState);
//     useEffect(() => {
//         if (!localStorage.getItem("color-scheme-preference")) {
//             const newTheme = prefersDark ? "dark" : "light";
//             document.body.classList.remove("color-" + theme);
//             document.body.classList.add("color-" + newTheme);
//             setTheme(newTheme);
//         }
//     }, [prefersDark]);

//     const toggleTheme = () => {
//         setTheme(theme => {
//             let newTheme: "light" | "dark" = "dark";
//             if (theme === "dark") {
//                 newTheme = "light";
//             }

//             document.body.classList.remove("color-" + theme);
//             document.body.classList.add("color-" + newTheme);
//             localStorage.setItem("color-scheme-preference", newTheme);

//             return newTheme;
//         })
//     };

//     return <button className={styles.ThemeButton} onClick={toggleTheme}>
//         <div className={styles.ThemeButtonLight}><Sun /></div>
//         <div className={styles.ThemeButtonDark}><Moon /></div>
//     </button>
// }

// function getCurrentThemeState(): "light" | "dark" {
//     if (typeof window === 'undefined') {
//         return "light";
//     }
//     const pref = localStorage.getItem("color-scheme-preference")
//     if (pref == "dark" || pref == "light") {
//         return pref;
//     }

//     return "light";
// }
