import chalk from "chalk";
import config from './config.json' with { type: 'json' };
import { GetToken } from "./api/auth.js";
import { SearchQueries } from "./database/search_query.js";
import { Locale } from "./types/spotify_api.js";


// Get Spotify Categories for keywords
(async () => {
    console.log(chalk.cyan('\n=== Fetching Spotify Categories ===\n'));

    try {
        // 手動調整這個 index 來選擇不同的 credential
        const CRED_INDEX = 0;

        const cred = config.spotify[CRED_INDEX];
        if (!cred) {
            console.log(chalk.red(`Credential #${CRED_INDEX} not found`));
            return;
        }

        console.log(chalk.gray(`Using credential #${CRED_INDEX + 1}`));

        // Get token
        const [token_res, token_err] = await GetToken(cred.clientID, cred.secret);
        if (token_err) {
            console.log(chalk.red('Failed to get token:'), token_err);
            return;
        }
        const token = token_res.access_token;
        console.log(chalk.green('Token obtained\n'));

        // Get categories with different locales and limits
        // const locales = ['en_US', 'zh_TW', 'ja_JP', 'ko_KR'];
        const locales: Locale[] = ['en_TW', 'zh_US'];
        const allCategoryNames = new Set<string>();

        for (const locale of locales) {
            console.log(chalk.yellow(`\nLocale: ${locale}`));
            console.log('─'.repeat(50));

            try {
                const url = `https://api.spotify.com/v1/browse/categories?locale=${locale}&limit=50`;
                const response = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) {
                    console.log(chalk.red(`Error: ${response.status} ${response.statusText}`));
                    continue;
                }

                const result = await response.json();
                const categories = result.categories.items;

                console.log(chalk.green(`Found ${categories.length} categories:\n`));

                categories.forEach((category: any, index: number) => {
                    console.log(`${index + 1}. ${chalk.white(category.name)}`);
                    console.log(`   ID: ${chalk.gray(category.id)}`);
                    if (category.icons && category.icons.length > 0) {
                        console.log(`   Icon: ${chalk.gray(category.icons[0].url)}`);
                    }
                    console.log();

                    // 收集所有分類名稱
                    allCategoryNames.add(category.name);
                });

                // Also log all category names as a comma-separated list for easy copying
                const categoryNames = categories.map((c: any) => c.name);
                console.log(chalk.cyan('\nCategory names (comma-separated):'));
                console.log(categoryNames.join(', '));
                console.log();

            } catch (error) {
                console.log(chalk.red(`Error fetching categories for ${locale}:`), error);
            }
        }

        // 插入資料庫
        console.log(chalk.cyan('\n=== Saving to Database ===\n'));
        console.log(chalk.gray(`Total unique categories found: ${allCategoryNames.size}`));

        const categoryArray = Array.from(allCategoryNames);
        const insertedCount = await SearchQueries.addAll(categoryArray, 'category');

        console.log(chalk.green(`✓ Inserted ${insertedCount} new categories into database`));
        console.log(chalk.gray(`(${allCategoryNames.size - insertedCount} were already in database)`));

        console.log(chalk.cyan('\n=== Done ===\n'));

    } catch (error) {
        console.log(chalk.red('Error:'), error);
    }
})();
